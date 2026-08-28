import { ProactiveAssistantService } from './proactive-assistant.service';

function buildBriefingItems() {
  return {
    items: [
      { kind: 'weather' as const, title: 'Thời tiết', message: 'Trời nắng.', path: '/', reason: 'weather', metadata: {} },
    ],
    eventItems: 0,
    financeItems: 0,
    weatherItems: 1,
    familyNoteItems: 0,
  };
}

function buildService(users: any[]) {
  const prisma = {
    user: { findMany: jest.fn().mockResolvedValue(users) },
    notification: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const weatherService = {
    getTodayForecast: jest.fn().mockResolvedValue(null),
    getTomorrowForecast: jest.fn().mockResolvedValue(null),
  };
  const proactiveBriefingBuilder = {
    buildDailyBriefing: jest.fn().mockResolvedValue(buildBriefingItems()),
    formatDailyBriefingMessage: jest.fn().mockResolvedValue('Nội dung tóm tắt.'),
  };
  const notificationDeliveryService = {
    createNotification: jest.fn().mockResolvedValue({ id: 'notification-1' }),
  };

  const service = new ProactiveAssistantService(
    prisma as any,
    weatherService as any,
    proactiveBriefingBuilder as any,
    notificationDeliveryService as any,
  );

  return { service, notificationDeliveryService };
}

describe('ProactiveAssistantService daily briefing signature', () => {
  it('gắn dòng "Nguyên yêu <tên user>" mặc định vào telegramExtra khi user chưa tự cấu hình', async () => {
    const { service, notificationDeliveryService } = buildService([
      { id: 'user-1', name: 'Yến', notificationSettings: {}, familyId: 'family-1', family: null, families: [] },
    ]);

    await service.run();

    expect(notificationDeliveryService.createNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ telegramExtra: 'Nguyên yêu Yến' }),
      expect.anything(),
    );
  });

  it('dùng tên tùy chỉnh trong notificationSettings.dailyBriefingSignature khi user đã đổi', async () => {
    const { service, notificationDeliveryService } = buildService([
      {
        id: 'user-1',
        name: 'Yến',
        notificationSettings: { dailyBriefingSignature: { fromName: 'Bố', toName: 'Con gái' } },
        familyId: 'family-1',
        family: null,
        families: [],
      },
    ]);

    await service.run();

    expect(notificationDeliveryService.createNotification).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ telegramExtra: 'Bố yêu Con gái' }),
      expect.anything(),
    );
  });

  it('không gắn dòng ký tên vào tóm tắt của chính admin (tự nhắc tên mình vô nghĩa)', async () => {
    const { service, notificationDeliveryService } = buildService([
      {
        id: 'admin-1',
        name: 'Nguyên Nguyễn Hoàng',
        globalRole: 'SUPER_ADMIN',
        notificationSettings: {},
        familyId: 'family-1',
        family: null,
        families: [],
      },
    ]);

    await service.run();

    const [, data] = notificationDeliveryService.createNotification.mock.calls[0];
    expect(data.telegramExtra).toBeUndefined();
  });
});
