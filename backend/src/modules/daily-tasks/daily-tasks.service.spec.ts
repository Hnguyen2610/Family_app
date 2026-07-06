import { DailyTasksService } from './daily-tasks.service';
import { getIctNow } from '../../utils/timezone.util';

jest.mock('../../utils/timezone.util', () => ({
  getIctNow: jest.fn(() => new Date('2026-07-06T09:00:00.000Z')),
  getIctDateKey: jest.fn((date: Date) => date.toISOString().slice(0, 10)),
}));

describe('DailyTasksService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-06T09:20:00.000Z'));
    (getIctNow as jest.Mock).mockReturnValue(new Date('2026-07-06T09:00:00.000Z'));
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

    const service = new DailyTasksService(
      prisma as any,
      telegramSender as any,
      webPushService as any,
    );

    return { service, prisma, telegramSender, webPushService };
  };

  it('marks a task as completed today using the real current time', async () => {
    const { service, prisma } = buildService();
    prisma.dailyTask.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.completeToday('task-1', 'user-1');

    expect(result).toEqual({ completed: true });
    expect(prisma.dailyTask.updateMany).toHaveBeenCalledWith({
      where: { id: 'task-1', userId: 'user-1' },
      data: { completedAt: new Date('2026-07-06T09:20:00.000Z') },
    });
  });

  it('skips tasks already completed today when triggering reminders', async () => {
    const { service, prisma, telegramSender, webPushService } = buildService();
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 'done-task',
        title: 'Done task',
        intervalMinutes: 30,
        priority: 0,
        lastNotifiedAt: null,
        completedAt: new Date('2026-07-06T08:00:00.000Z'),
      },
      {
        id: 'next-task',
        title: 'Next task',
        intervalMinutes: 30,
        priority: 1,
        lastNotifiedAt: null,
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
        completedAt: null,
      },
    ]);
    telegramSender.sendDailyTaskReminderToUser.mockResolvedValue({ ok: true });
    prisma.dailyTask.update.mockResolvedValue({});

    await service.triggerNext('user-1');

    expect(prisma.dailyTask.update).toHaveBeenCalledWith({
      where: { id: 'task-1' },
      data: { lastNotifiedAt: new Date('2026-07-06T09:20:00.000Z') },
    });
  });

  it('does not rotate reminder time when no delivery channel succeeds', async () => {
    const { service, prisma, telegramSender, webPushService } = buildService();
    prisma.dailyTask.findMany.mockResolvedValue([
      {
        id: 'task-1',
        title: 'Retry task',
        intervalMinutes: 30,
        priority: 0,
        lastNotifiedAt: null,
        completedAt: null,
      },
    ]);
    telegramSender.sendDailyTaskReminderToUser.mockResolvedValue({
      ok: false,
      reason: 'telegram_chat_not_linked',
    });
    webPushService.sendToUser.mockRejectedValue(new Error('no subscription'));

    const result = await service.triggerNext('user-1');

    expect(result).toEqual({
      sent: false,
      task: 'Retry task',
      reason: 'telegram_chat_not_linked',
      telegram: false,
      webPush: false,
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
      data: { lastNotifiedAt: null, completedAt: null },
    });
  });
});
