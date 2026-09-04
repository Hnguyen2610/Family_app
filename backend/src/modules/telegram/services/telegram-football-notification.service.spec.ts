import { TelegramFootballNotificationService } from './telegram-football-notification.service';

describe('TelegramFootballNotificationService', () => {
  let prisma: any;
  let footballService: any;
  let telegramService: any;
  let service: TelegramFootballNotificationService;

  const match = {
    id: 1,
    utcDate: '2026-09-04T11:00:00.000Z',
    competitionCode: 'VLEAGUE',
    competitionName: 'V-League 1',
    homeTeam: 'Trường Tươi Đồng Nai',
    awayTeam: 'Thể Công Viettel',
    status: 'TIMED',
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-04T00:30:00.000Z'));

    const claims = new Set<string>();
    prisma = {
      footballDailyNotificationClaim: {
        create: jest.fn(async ({ data }: any) => {
          const key = `${data.userId}:${data.dateKey}`;
          if (claims.has(key)) {
            const error: any = new Error('Unique constraint failed');
            error.code = 'P2002';
            throw error;
          }
          claims.add(key);
          return { id: key, ...data };
        }),
      },
      notificationDeliveryLog: {
        // Old implementation's check: both racing calls see "not sent yet" here, since
        // neither has written its row before the other reads — that's the race itself.
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'user-1', name: 'Bố', notificationSettings: {} },
        ]),
      },
    };
    footballService = {
      getTodayMatches: jest.fn().mockResolvedValue([match]),
    };
    telegramService = {
      sendMessageToUser: jest.fn().mockResolvedValue(true),
    };
    service = new TelegramFootballNotificationService(prisma, footballService, telegramService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the Telegram message only once when two runs race for the same user/day', async () => {
    const [first, second] = await Promise.all([
      service.sendTodayFootballSchedule(),
      service.sendTodayFootballSchedule(),
    ]);

    expect(telegramService.sendMessageToUser).toHaveBeenCalledTimes(1);
    expect(first.sent + second.sent).toBe(1);
    expect(first.skipped + second.skipped).toBe(1);
  });

  it('sends normally when only a single run happens', async () => {
    const summary = await service.sendTodayFootballSchedule();

    expect(telegramService.sendMessageToUser).toHaveBeenCalledTimes(1);
    expect(summary.sent).toBe(1);
    expect(summary.skipped).toBe(0);
  });
});
