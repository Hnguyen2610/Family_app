import { DailyTasksService } from './daily-tasks.service';

jest.mock('../../utils/timezone.util', () => ({
  ICT_TIME_ZONE: 'Asia/Ho_Chi_Minh',
  getIctDateKey: jest.fn((date: Date) => date.toISOString().slice(0, 10)),
}));

describe('DailyTasksService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-06T09:20:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const buildService = () => {
    const prisma = {
      dailyTask: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const telegramSender = {
      sendDailyTaskReminderToUser: jest.fn(),
      sendMessageToUser: jest.fn(),
    };
    const webPushService = {
      sendToUser: jest.fn(),
    };
    const notificationsService = {
      createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
    };

    const service = new DailyTasksService(
      prisma as any,
      telegramSender as any,
      webPushService as any,
      notificationsService as any,
    );

    return { service, prisma, telegramSender, webPushService, notificationsService };
  };

  it('marks a task as completed today using the real current time', async () => {
    const { service, prisma } = buildService();
    prisma.dailyTask.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.completeToday('task-1', 'user-1');

    expect(result).toEqual({ completed: true });
    expect(prisma.dailyTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', userId: 'user-1' },
      data: { completedAt: new Date('2026-07-06T09:20:00.000Z'), nextReminderAt: null },
    });
  });

  it('skips tasks already completed today when triggering reminders', async () => {
    const { service, prisma, telegramSender, webPushService, notificationsService } = buildService();
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 'done-task',
        title: 'Done task',
        intervalMinutes: 30,
        priority: 0,
        lastNotifiedAt: null,
        nextReminderAt: new Date('2026-07-06T09:00:00.000Z'),
        completedAt: new Date('2026-07-06T08:00:00.000Z'),
      },
      {
        id: 'next-task',
        title: 'Next task',
        intervalMinutes: 30,
        priority: 1,
        lastNotifiedAt: null,
        nextReminderAt: new Date('2026-07-06T09:00:00.000Z'),
        completedAt: null,
      },
    ]);
    telegramSender.sendDailyTaskReminderToUser.mockResolvedValue({ ok: true });
    prisma.dailyTask.update.mockResolvedValue({});

    const result = await service.triggerNext('user-1');

    expect(result).toEqual({
      sent: true,
      task: 'Next task',
      telegram: true,
      webPush: true,
      inApp: true,
      reason: undefined,
    });
    expect(telegramSender.sendDailyTaskReminderToUser).toHaveBeenCalledWith(
      'user-1',
      expect.stringContaining('Next task'),
      'next-task',
    );
    expect(webPushService.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ body: 'Next task' }),
    );
    expect(notificationsService.createNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        type: 'DAILY_TASK',
        message: 'Next task',
        metadata: expect.objectContaining({ taskId: 'next-task', path: '/daily-tasks' }),
      }),
      { skipTelegram: true, skipWebPush: true },
    );
  });

  it('stores the real current time when sending reminders instead of the ICT display time', async () => {
    const { service, prisma, telegramSender } = buildService();
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Timezone task',
        intervalMinutes: 30,
        priority: 0,
        lastNotifiedAt: null,
        nextReminderAt: new Date('2026-07-06T09:00:00.000Z'),
        completedAt: null,
      },
    ]);
    telegramSender.sendDailyTaskReminderToUser.mockResolvedValue({ ok: true });
    prisma.dailyTask.update.mockResolvedValue({});

    await service.triggerNext('user-1');

    expect(prisma.dailyTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: {
        lastNotifiedAt: new Date('2026-07-06T09:20:00.000Z'),
        nextReminderAt: expect.any(Date),
      },
    });
  });

  it('does not send the first reminder before the interval has elapsed from the active window start', async () => {
    const { service, prisma, telegramSender, webPushService } = buildService();
    jest.setSystemTime(new Date('2026-07-06T01:15:00.000Z'));
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Morning task',
        intervalMinutes: 30,
        priority: 0,
        lastNotifiedAt: null,
        completedAt: null,
      },
    ]);

    const result = await service.triggerNext('user-1');

    expect(result).toEqual({ sent: false, reason: 'no_task_due' });
    expect(telegramSender.sendDailyTaskReminderToUser).not.toHaveBeenCalled();
    expect(webPushService.sendToUser).not.toHaveBeenCalled();
  });

  it('sends the first reminder when the interval has elapsed from the active window start', async () => {
    const { service, prisma, telegramSender } = buildService();
    jest.setSystemTime(new Date('2026-07-06T01:30:00.000Z'));
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Morning task',
        intervalMinutes: 30,
        priority: 0,
        lastNotifiedAt: null,
        completedAt: null,
      },
    ]);
    telegramSender.sendDailyTaskReminderToUser.mockResolvedValue({ ok: true });
    prisma.dailyTask.update.mockResolvedValue({});

    const result = await service.triggerNext('user-1');

    expect(result.sent).toBe(true);
    expect(telegramSender.sendDailyTaskReminderToUser).toHaveBeenCalled();
  });

  it('does not rotate reminder time when no delivery channel succeeds', async () => {
    const { service, prisma, telegramSender, webPushService, notificationsService } = buildService();
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Retry task',
        intervalMinutes: 30,
        priority: 0,
        lastNotifiedAt: null,
        nextReminderAt: new Date('2026-07-06T09:00:00.000Z'),
        completedAt: null,
      },
    ]);
    telegramSender.sendDailyTaskReminderToUser.mockResolvedValue({
      ok: false,
      reason: 'telegram_chat_not_linked',
    });
    webPushService.sendToUser.mockRejectedValue(new Error('no subscription'));
    notificationsService.createNotification.mockResolvedValue(undefined);

    const result = await service.triggerNext('user-1');

    expect(result).toEqual({
      sent: false,
      task: 'Retry task',
      reason: 'telegram_chat_not_linked',
      telegram: false,
      webPush: false,
      inApp: false,
    });
    expect(prisma.dailyTask.update).not.toHaveBeenCalled();
  });

  it('clears notification and completion state on daily reset', async () => {
    const { service, prisma } = buildService();
    prisma.dailyTask.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.resetDaily('user-1');

    expect(result).toEqual({ reset: 2 });
    expect(prisma.dailyTask.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { lastNotifiedAt: null, completedAt: null, nextReminderAt: null },
    });
  });
});
