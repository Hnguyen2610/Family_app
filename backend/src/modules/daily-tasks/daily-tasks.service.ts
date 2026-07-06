import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramSender } from '../telegram/services/telegram-sender';
import { WebPushService } from '../notifications/web-push.service';
import { getIctDateKey, getIctNow } from '../../utils/timezone.util';

const ACTIVE_WINDOWS = [
  { start: 8, end: 12 },
  { start: 14, end: 17 },
];

function isWithinActiveHours(now: Date): boolean {
  const hour = now.getHours();
  return ACTIVE_WINDOWS.some((window) => hour >= window.start && hour < window.end);
}

export interface CreateDailyTaskDto {
  userId: string;
  title: string;
  priority?: number;
  intervalMinutes?: number;
}

export interface UpdateDailyTaskDto {
  title?: string;
  priority?: number;
  intervalMinutes?: number;
  isActive?: boolean;
  completedAt?: Date | null;
}

export interface ReorderDto {
  id: string;
  priority: number;
}

export interface TriggerNextResult {
  sent: boolean;
  task?: string;
  reason?: string;
  telegram?: boolean;
  webPush?: boolean;
}

@Injectable()
export class DailyTasksService {
  private readonly logger = new Logger(DailyTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramSender: TelegramSender,
    private readonly webPushService: WebPushService,
  ) {}

  async findAll(userId: string) {
    return this.prisma.dailyTask.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
  }

  async create(dto: CreateDailyTaskDto) {
    if (dto.priority === undefined) {
      const last = await this.prisma.dailyTask.findFirst({
        where: { userId: dto.userId },
        orderBy: { priority: 'desc' },
      });
      dto.priority = last ? last.priority + 1 : 0;
    }
    return this.prisma.dailyTask.create({ data: dto });
  }

  async update(id: string, dto: UpdateDailyTaskDto) {
    await this.findOneOrThrow(id);
    return this.prisma.dailyTask.update({ where: { id }, data: dto });
  }

  async reorder(items: ReorderDto[]) {
    await this.prisma.$transaction(
      items.map(({ id, priority }) =>
        this.prisma.dailyTask.update({ where: { id }, data: { priority } }),
      ),
    );
    return { success: true };
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.prisma.dailyTask.delete({ where: { id } });
    return { success: true };
  }

  async completeToday(id: string, userId: string) {
    const result = await this.prisma.dailyTask.updateMany({
      where: { id, userId },
      data: { completedAt: new Date() },
    });
    return { completed: result.count > 0 };
  }

  async triggerNext(userId: string): Promise<TriggerNextResult> {
    const activeHourNow = getIctNow();
    const now = new Date();

    if (!isWithinActiveHours(activeHourNow)) {
      this.logger.log(`[DailyTasks] Outside active hours for user ${userId}`);
      return { sent: false, reason: 'outside_active_hours' };
    }

    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (!tasks.length) return { sent: false, reason: 'no_active_tasks' };

    const nowMs = now.getTime();
    const due = tasks.find((task) => {
      if (this.isCompletedToday(task.completedAt, now)) return false;
      if (!task.lastNotifiedAt) return true;
      const elapsedMinutes = (nowMs - task.lastNotifiedAt.getTime()) / 60_000;
      return elapsedMinutes >= task.intervalMinutes;
    });

    if (!due) {
      this.logger.log(`[DailyTasks] No task is due yet for user ${userId}`);
      return { sent: false, reason: 'no_task_due' };
    }

    const totalActive = tasks.length;
    const position = tasks.findIndex((task) => task.id === due.id) + 1;
    const message =
      `<b>Nhắc việc (${position}/${totalActive})</b>\n` +
      `${due.title}\n` +
      `Nhắc lại sau: <b>${due.intervalMinutes} phút</b>`;

    const telegramResult = await this.telegramSender.sendDailyTaskReminderToUser(userId, message, due.id);

    let sentWebPush = false;
    try {
      await this.webPushService.sendToUser(userId, {
        title: `Nhắc việc (${position}/${totalActive})`,
        body: due.title,
        icon: '/icon.png',
        tag: `daily-task-${due.id}`,
        data: {
          url: '/daily-tasks',
        },
      });
      sentWebPush = true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[DailyTasks] Web push failed for user ${userId}: ${errorMessage}`);
    }

    const sentAnyChannel = telegramResult.ok || sentWebPush;
    if (!sentAnyChannel) {
      const reason = telegramResult.reason || 'delivery_failed';
      this.logger.warn(`[DailyTasks] No delivery channel succeeded for "${due.title}" to user ${userId}: ${reason}`);
      return {
        sent: false,
        task: due.title,
        reason,
        telegram: false,
        webPush: false,
      };
    }

    await this.prisma.dailyTask.update({
      where: { id: due.id },
      data: { lastNotifiedAt: now },
    });

    this.logger.log(
      `[DailyTasks] Sent task reminder "${due.title}" to user ${userId} (Telegram: ${telegramResult.ok}, WebPush: ${sentWebPush})`,
    );

    return {
      sent: true,
      task: due.title,
      telegram: telegramResult.ok,
      webPush: sentWebPush,
      reason: telegramResult.ok ? undefined : telegramResult.reason,
    };
  }

  async resetDaily(userId: string) {
    const result = await this.prisma.dailyTask.updateMany({
      where: { userId },
      data: { lastNotifiedAt: null, completedAt: null },
    });
    this.logger.log(`[DailyTasks] Reset ${result.count} tasks for user ${userId}`);
    return { reset: result.count };
  }

  private async findOneOrThrow(id: string) {
    const task = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`DailyTask ${id} not found`);
    return task;
  }

  private isCompletedToday(completedAt: Date | null, now: Date) {
    if (!completedAt) return false;
    return getIctDateKey(completedAt) === getIctDateKey(now);
  }
}
