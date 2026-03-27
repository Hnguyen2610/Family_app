import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);

  constructor(private readonly prisma: PrismaService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;

    if (publicKey && privateKey && subject) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('WebPush configured successfully');
    } else {
      this.logger.warn('WebPush VAPID keys not fully configured in environment variables');
    }
  }

  async sendToUser(userId: string, payload: any) {
    try {
      const subscriptions = await this.prisma.pushSubscription.findMany({
        where: { userId }
      });

      if (subscriptions.length === 0) return;

      const results = await Promise.allSettled(
        subscriptions.map(sub => 
          webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            },
            JSON.stringify(payload)
          )
        )
      );

      // Clean up expired or invalid subscriptions
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          const error = result.reason;
          if (error.statusCode === 404 || error.statusCode === 410) {
            this.logger.warn(`Push subscription expired/invalid for user ${userId}, deleting...`);
            await this.prisma.pushSubscription.delete({
              where: { id: subscriptions[i].id }
            });
          } else {
            this.logger.error(`Failed to send push to subscription ${subscriptions[i].id}`, error);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Error sending WebPush to user ${userId}`, error);
    }
  }

  async sendToMultipleUsers(userIds: string[], payload: any) {
    const promises = userIds.map(userId => this.sendToUser(userId, payload));
    await Promise.allSettled(promises);
  }
}
