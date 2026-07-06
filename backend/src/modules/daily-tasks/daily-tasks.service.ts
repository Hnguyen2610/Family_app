import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramSender } from '../telegram/services/telegram-sender';
import { WebPushService } from '../notifications/web-push.service';
import { getIctNow } from '../../utils/timezone.util';

// Active hours in ICT (Ho Chi Minh timezone)
const ACTIVE_WINDOWS = [
  { start: 8, end: 12 },
  { start: 14, end: 17 },
];

function isWithinActiveHours(now: Date): boolean {
  const h = now.getHours();
  return ACTIVE_WINDOWS.some((w) => h >= w.start && h < w.end);
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
}

export interface ReorderDto {
  id: string;
  priority: number;
}

@Injectable()
export class DailyTasksService {
  private readonly logger = new Logger(DailyTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramSender: TelegramSender,
    private readonly webPushService: WebPushService,
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────

  async findAll(userId: string) {
    return this.prisma.dailyTask.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
  }

  async create(dto: CreateDailyTaskDto) {
    // Auto-assign next priority if not provided
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

  // ── Trigger next ──────────────────────────────────────────────────────

  async triggerNext(userId: string): Promise<{ sent: boolean; task?: string; reason?: string }> {
    const now = getIctNow();

    if (!isWithinActiveHours(now)) {
      this.logger.log(`[DailyTasks] Outside active hours for user ${userId}`);
      return { sent: false, reason: 'outside_active_hours' };
    }

    // Find highest-priority task that is due
    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (!tasks.length) return { sent: false, reason: 'no_active_tasks' };

    const nowMs = now.getTime();
    const due = tasks.find((t) => {
      if (!t.lastNotifiedAt) return true; // never notified
      const elapsed = (nowMs - t.lastNotifiedAt.getTime()) / 60_000;
      return elapsed >= t.intervalMinutes;
    });

    if (!due) {
      this.logger.log(`[DailyTasks] No task is due yet for user ${userId}`);
      return { sent: false, reason: 'no_task_due' };
    }

    // Build the Telegram message
    const totalActive = tasks.length;
    const position = tasks.findIndex((t) => t.id === due.id) + 1;
    const message =
      `🔔 <b>Nhắc việc (${position}/${totalActive})</b>\n` +
      `📌 ${due.title}\n` +
      `⏱ Nhắc lại sau: <b>${due.intervalMinutes} phút</b>`;

    // Send Telegram
    const sentTelegram = await this.telegramSender.sendMessageToUser(userId, message);

    // Send Web Push notification
    await this.webPushService.sendToUser(userId, {
      title: `🔔 Nhắc việc (${position}/${totalActive})`,
      body: due.title,
      icon: '/icon.png',
      tag: `daily-task-${due.id}`,
      data: {
        url: '/daily-tasks',
      },
    });

    // Update last notified time to rotate
    await this.prisma.dailyTask.update({
      where: { id: due.id },
      data: { lastNotifiedAt: now },
    });
    
    this.logger.log(`[DailyTasks] Sent task reminder "${due.title}" to user ${userId} (Telegram: ${sentTelegram})`);

    return { sent: sentTelegram, task: due.title };
  }

  // ── Daily reset ───────────────────────────────────────────────────────

  async resetDaily(userId: string) {
    const result = await this.prisma.dailyTask.updateMany({
      where: { userId },
      data: { lastNotifiedAt: null },
    });
    this.logger.log(`[DailyTasks] Reset ${result.count} tasks for user ${userId}`);
    return { reset: result.count };
  }

  // ── Helper ────────────────────────────────────────────────────────────

  private async findOneOrThrow(id: string) {
    const task = await this.prisma.dailyTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException(`DailyTask ${id} not found`);
    return task;
  }
}
