import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { WebPushService } from './web-push.service';
import { CreateNotificationOptions, NotificationPayload } from './notification-types';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPushService: WebPushService,
    private readonly telegramService: TelegramService,
  ) {}

  async createNotification(
    userId: string,
    data: NotificationPayload,
    options: CreateNotificationOptions | boolean = {},
  ) {
    try {
      const skipTelegram = typeof options === 'boolean' ? options : options.skipTelegram === true;
      const skipWebPush = typeof options === 'boolean' ? false : options.skipWebPush === true;
      const dbNotification = await this.prisma.notification.create({
        data: {
          userId,
          type: data.type,
          title: data.title,
          message: data.message,
          metadata: data.metadata || {},
        },
      });

      if (!skipWebPush) {
        await this.webPushService.sendToUser(userId, {
          title: data.title,
          body: data.message,
          url: data.metadata?.path || '/',
        });
      }

      if (!skipTelegram) {
        await this.telegramService.sendMessageToUser(userId, `<b>${data.title}</b>\n${data.message}`);
      }

      return dbNotification;
    } catch (error) {
      this.logger.error(`Failed to create notification for user ${userId}`, error);
    }
  }
}
