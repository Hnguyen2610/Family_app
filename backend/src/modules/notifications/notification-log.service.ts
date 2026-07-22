import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class NotificationLogService {
  private readonly logger = new Logger(NotificationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(logData: {
    userId?: string;
    familyId?: string;
    type: string;
    channel: 'telegram' | 'webpush' | 'email' | 'inapp';
    status: 'SENT' | 'FAILED' | 'SKIPPED';
    title: string;
    body: string;
    metadata?: Record<string, any>;
    errorMessage?: string;
  }) {
    try {
      return await this.prisma.notificationDeliveryLog.create({
        data: {
          userId: logData.userId,
          familyId: logData.familyId,
          type: logData.type,
          channel: logData.channel,
          status: logData.status,
          title: logData.title,
          body: logData.body,
          metadata: logData.metadata || {},
          errorMessage: logData.errorMessage,
        },
      });
    } catch (error) {
      this.logger.error('Failed to write notification delivery log to database', error);
    }
  }

  async getLogs(query: { userId?: string; familyId?: string; limit?: number }) {
    const limit = query.limit || 50;
    return this.prisma.notificationDeliveryLog.findMany({
      where: {
        AND: [
          query.userId ? { userId: query.userId } : {},
          query.familyId ? { familyId: query.familyId } : {},
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
