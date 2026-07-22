import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { WebPushService } from './web-push.service';
import { CreateNotificationOptions, NotificationPayload } from './notification-types';
import { NotificationLogService } from './notification-log.service';

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webPushService: WebPushService,
    private readonly telegramService: TelegramService,
    private readonly notificationLogService: NotificationLogService,
  ) {}

  async createNotification(
    userId: string,
    data: NotificationPayload,
    options: CreateNotificationOptions | boolean = {},
  ) {
    try {
      const skipTelegram = typeof options === 'boolean' ? options : options.skipTelegram === true;
      const skipWebPush = typeof options === 'boolean' ? false : options.skipWebPush === true;
      let dbNotification: any = null;

      try {
        dbNotification = await this.prisma.notification.create({
          data: {
            userId,
            type: data.type,
            title: data.title,
            message: data.message,
            metadata: data.metadata || {},
          },
        });
        await this.notificationLogService.record({
          userId,
          type: data.type,
          channel: 'inapp',
          status: 'SENT',
          title: data.title,
          body: data.message,
          metadata: data.metadata || {},
        });
      } catch (inappErr: any) {
        this.logger.error(`Failed to create db notification for user ${userId}`, inappErr);
        await this.notificationLogService.record({
          userId,
          type: data.type,
          channel: 'inapp',
          status: 'FAILED',
          title: data.title,
          body: data.message,
          metadata: data.metadata || {},
          errorMessage: inappErr?.message || String(inappErr),
        });
      }

      if (!skipWebPush) {
        try {
          await this.webPushService.sendToUser(userId, {
            title: data.title,
            body: data.message,
            url: data.metadata?.path || '/',
          });
          await this.notificationLogService.record({
            userId,
            type: data.type,
            channel: 'webpush',
            status: 'SENT',
            title: data.title,
            body: data.message,
            metadata: data.metadata || {},
          });
        } catch (pushErr: any) {
          this.logger.error(`Failed to send webpush for user ${userId}`, pushErr);
          await this.notificationLogService.record({
            userId,
            type: data.type,
            channel: 'webpush',
            status: 'FAILED',
            title: data.title,
            body: data.message,
            metadata: data.metadata || {},
            errorMessage: pushErr?.message || String(pushErr),
          });
        }
      } else {
        await this.notificationLogService.record({
          userId,
          type: data.type,
          channel: 'webpush',
          status: 'SKIPPED',
          title: data.title,
          body: data.message,
          metadata: data.metadata || {},
        });
      }

      if (!skipTelegram) {
        try {
          await this.telegramService.sendMessageToUser(userId, `<b>${data.title}</b>\n${data.message}`);
          await this.notificationLogService.record({
            userId,
            type: data.type,
            channel: 'telegram',
            status: 'SENT',
            title: data.title,
            body: data.message,
            metadata: data.metadata || {},
          });
        } catch (tgErr: any) {
          this.logger.error(`Failed to send telegram message for user ${userId}`, tgErr);
          await this.notificationLogService.record({
            userId,
            type: data.type,
            channel: 'telegram',
            status: 'FAILED',
            title: data.title,
            body: data.message,
            metadata: data.metadata || {},
            errorMessage: tgErr?.message || String(tgErr),
          });
        }
      } else {
        await this.notificationLogService.record({
          userId,
          type: data.type,
          channel: 'telegram',
          status: 'SKIPPED',
          title: data.title,
          body: data.message,
          metadata: data.metadata || {},
        });
      }

      return dbNotification;
    } catch (error) {
      this.logger.error(`Failed to execute createNotification flow for user ${userId}`, error);
    }
  }
}
