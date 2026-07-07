import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramSender } from '../telegram/services/telegram-sender';
import { WebPushService } from '../notifications/web-push.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ICT_TIME_ZONE, getIctDateKey } from '../../utils/timezone.util';

const DEFAULT_ACTIVE_START_TIME = '08:00';
const DEFAULT_ACTIVE_END_TIME = '17:00';

type IctParts = {
  year: number;
  month: number;
  day: number;
  weekday: number;
  minutes: number;
};

type DailyTaskLike = {
  intervalMinutes: number;
  repeatWeekdays?: any;
  activeStartTime?: string | null;
  activeEndTime?: string | null;
  nextReminderAt?: Date | null;
  lastNotifiedAt?: Date | null;
  completedAt?: Date | null;
};

function getIctParts(date: Date): IctParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ICT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    weekday: weekdayMap[values.weekday] ?? 0,
    minutes: Number(values.hour) * 60 + Number(values.minute),
  };
}

function parseTimeToMinutes(value?: string | null, fallback = DEFAULT_ACTIVE_START_TIME) {
  const source = value && /^\d{2}:\d{2}$/.test(value) ? value : fallback;
  const [hour, minute] = source.split(':').map(Number);
  return Math.max(0, Math.min(23 * 60 + 59, hour * 60 + minute));
}

function ictWallTimeToInstant(parts: IctParts, minutes: number) {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour - 7, minute, 0, 0));
}

function addIctDays(parts: IctParts, days: number): IctParts {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 0, 0, 0, 0));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    weekday: utc.getUTCDay(),
    minutes: parts.minutes,
  };
}

function normalizeWeekdays(value: any): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6)),
  ).sort((a, b) => a - b);
}

function runsOnWeekday(task: DailyTaskLike, weekday: number) {
  const weekdays = normalizeWeekdays(task.repeatWeekdays);
  return weekdays.length === 0 || weekdays.includes(weekday);
}

function findNextAllowedDay(task: DailyTaskLike, from: IctParts) {
  for (let offset = 0; offset < 8; offset += 1) {
    const candidate = addIctDays(from, offset);
    if (runsOnWeekday(task, candidate.weekday)) return candidate;
  }
  return from;
}

function alignToNextSlotFromStart(currentMinutes: number, startMinutes: number, intervalMinutes: number) {
  if (currentMinutes <= startMinutes) return startMinutes;
  const elapsed = currentMinutes - startMinutes;
  const slots = Math.ceil(elapsed / Math.max(1, intervalMinutes));
  return startMinutes + slots * Math.max(1, intervalMinutes);
}

function calculateNextReminderAt(task: DailyTaskLike, now = new Date(), afterNotification = false): Date {
  const ictNow = getIctParts(now);
  const startMinutes = parseTimeToMinutes(task.activeStartTime, DEFAULT_ACTIVE_START_TIME);
  const endMinutes = parseTimeToMinutes(task.activeEndTime, DEFAULT_ACTIVE_END_TIME);
  const interval = Math.max(1, Number(task.intervalMinutes || 30));
  const todayAllowed = runsOnWeekday(task, ictNow.weekday);

  if (todayAllowed && ictNow.minutes < endMinutes) {
    const baseMinutes = afterNotification
      ? ictNow.minutes + interval
      : alignToNextSlotFromStart(ictNow.minutes, startMinutes, interval);
    if (baseMinutes < endMinutes) {
      return ictWallTimeToInstant(ictNow, baseMinutes);
    }
  }

  const tomorrow = addIctDays(ictNow, 1);
  const nextDay = findNextAllowedDay(task, tomorrow);
  return ictWallTimeToInstant(nextDay, startMinutes);
}

function isTaskDue(task: DailyTaskLike, now = new Date()) {
  if (task.nextReminderAt) return task.nextReminderAt.getTime() <= now.getTime();
  return calculateNextReminderAt(task, now).getTime() <= now.getTime();
}

export interface CreateDailyTaskDto {
  userId: string;
  title: string;
  priority?: number;
  intervalMinutes?: number;
  repeatWeekdays?: number[];
  activeStartTime?: string;
  activeEndTime?: string;
}

export interface UpdateDailyTaskDto {
  title?: string;
  priority?: number;
  intervalMinutes?: number;
  repeatWeekdays?: number[];
  activeStartTime?: string;
  activeEndTime?: string;
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
  inApp?: boolean;
}

@Injectable()
export class DailyTasksService {
  private readonly logger = new Logger(DailyTasksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramSender: TelegramSender,
    private readonly webPushService: WebPushService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async findAll(userId: string) {
    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
    const now = new Date();
    return tasks.map((task) => ({
      ...task,
      nextReminderAt: !task.isActive || this.isCompletedToday(task.completedAt, now)
        ? null
        : task.nextReminderAt || calculateNextReminderAt(task, now),
    }));
  }

  async create(dto: CreateDailyTaskDto) {
    if (dto.priority === undefined) {
      const last = await this.prisma.dailyTask.findFirst({
        where: { userId: dto.userId },
        orderBy: { priority: 'desc' },
      });
      dto.priority = last ? last.priority + 1 : 0;
    }
    const data = {
      ...dto,
      intervalMinutes: Math.max(1, Number(dto.intervalMinutes || 30)),
      repeatWeekdays: normalizeWeekdays(dto.repeatWeekdays),
      activeStartTime: dto.activeStartTime || DEFAULT_ACTIVE_START_TIME,
      activeEndTime: dto.activeEndTime || DEFAULT_ACTIVE_END_TIME,
    };
    return this.prisma.dailyTask.create({
      data: {
        ...data,
        nextReminderAt: calculateNextReminderAt(data),
      },
    });
  }

  async update(id: string, dto: UpdateDailyTaskDto) {
    const task = await this.findOneOrThrow(id);
    const data: any = {
      ...dto,
    };
    if (dto.intervalMinutes !== undefined) data.intervalMinutes = Math.max(1, Number(dto.intervalMinutes || 30));
    if (dto.repeatWeekdays !== undefined) data.repeatWeekdays = normalizeWeekdays(dto.repeatWeekdays);

    const nextTask = { ...task, ...data };
    if (
      dto.intervalMinutes !== undefined ||
      dto.repeatWeekdays !== undefined ||
      dto.activeStartTime !== undefined ||
      dto.activeEndTime !== undefined ||
      dto.isActive !== undefined
    ) {
      data.nextReminderAt = nextTask.isActive && !this.isCompletedToday(nextTask.completedAt, new Date())
        ? calculateNextReminderAt(nextTask)
        : null;
    }
    return this.prisma.dailyTask.update({ where: { id }, data });
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
      data: { completedAt: new Date(), nextReminderAt: null },
    });
    return { completed: result.count > 0 };
  }

  async triggerNext(userId: string): Promise<TriggerNextResult> {
    const now = new Date();

    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'asc' },
    });

    if (!tasks.length) return { sent: false, reason: 'no_active_tasks' };

    const nowMs = now.getTime();
    const due = tasks.find((task) => {
      if (this.isCompletedToday(task.completedAt, now)) return false;
      if (!runsOnWeekday(task, getIctParts(now).weekday)) return false;
      if (!isTaskDue(task, now)) return false;
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

    const inAppNotification = await this.notificationsService.createNotification(
      userId,
      {
        type: 'DAILY_TASK',
        title: `Nhắc việc (${position}/${totalActive})`,
        message: due.title,
        metadata: {
          path: '/daily-tasks',
          taskId: due.id,
        },
      },
      { skipTelegram: true, skipWebPush: true },
    );
    const sentInApp = Boolean(inAppNotification);

    const sentAnyChannel = telegramResult.ok || sentWebPush || sentInApp;
    if (!sentAnyChannel) {
      const reason = telegramResult.reason || 'delivery_failed';
      this.logger.warn(`[DailyTasks] No delivery channel succeeded for "${due.title}" to user ${userId}: ${reason}`);
      return {
        sent: false,
        task: due.title,
        reason,
        telegram: false,
        webPush: false,
        inApp: false,
      };
    }

    await this.prisma.dailyTask.update({
      where: { id: due.id },
      data: {
        lastNotifiedAt: now,
        nextReminderAt: calculateNextReminderAt(due, now, true),
      },
    });

    this.logger.log(
      `[DailyTasks] Sent task reminder "${due.title}" to user ${userId} (Telegram: ${telegramResult.ok}, WebPush: ${sentWebPush}, InApp: ${sentInApp})`,
    );

    return {
      sent: true,
      task: due.title,
      telegram: telegramResult.ok,
      webPush: sentWebPush,
      inApp: sentInApp,
      reason: telegramResult.ok ? undefined : telegramResult.reason,
    };
  }

  async resetDaily(userId: string) {
    const result = await this.prisma.dailyTask.updateMany({
      where: { userId },
      data: { lastNotifiedAt: null, completedAt: null, nextReminderAt: null },
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
