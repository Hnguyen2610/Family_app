import { NotificationDeliveryService } from './notification-delivery.service';

function buildService() {
  const prisma = { notification: { create: jest.fn().mockResolvedValue({ id: 'notification-1' }) } };
  const webPushService = { sendToUser: jest.fn().mockResolvedValue(undefined) };
  const telegramService = { sendMessageToUser: jest.fn().mockResolvedValue(undefined) };
  const notificationLogService = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new NotificationDeliveryService(
    prisma as any,
    webPushService as any,
    telegramService as any,
    notificationLogService as any,
  );

  return { service, prisma, webPushService, telegramService, notificationLogService };
}

describe('NotificationDeliveryService.createNotification', () => {
  it('nối telegramExtra vào cuối tin nhắn Telegram nhưng không đưa vào thông báo in-app/web push', async () => {
    const { service, prisma, webPushService, telegramService } = buildService();

    await service.createNotification('user-1', {
      type: 'PROACTIVE_DAILY_BRIEFING',
      title: 'Tóm tắt gia đình 28/8/2026',
      message: 'Nội dung tóm tắt.',
      telegramExtra: 'Nguyên yêu Yến',
    });

    expect(telegramService.sendMessageToUser).toHaveBeenCalledWith(
      'user-1',
      '<b>Tóm tắt gia đình 28/8/2026</b>\nNội dung tóm tắt.\n\nNguyên yêu Yến',
    );
    expect(webPushService.sendToUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ body: 'Nội dung tóm tắt.' }),
    );
    expect(prisma.notification.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ message: 'Nội dung tóm tắt.' }) }),
    );
  });

  it('không thêm dòng nào vào tin nhắn Telegram khi không truyền telegramExtra', async () => {
    const { service, telegramService } = buildService();

    await service.createNotification('user-1', {
      type: 'BIRTHDAY',
      title: 'Sinh nhật',
      message: 'Hôm nay là sinh nhật của Yến.',
    });

    expect(telegramService.sendMessageToUser).toHaveBeenCalledWith(
      'user-1',
      '<b>Sinh nhật</b>\nHôm nay là sinh nhật của Yến.',
    );
  });
});
