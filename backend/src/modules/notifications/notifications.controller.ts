import { Controller, Get, Headers, UnauthorizedException, Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('daily')
  async triggerDailyReminder(@Headers('x-vercel-cron-auth') authHeader: string) {
    // Basic security using a custom header or environment variable
    this.verifyAuth(authHeader);
    
    this.logger.log('Manually triggering daily reminder via Vercel Cron endpoint');
    await this.notificationsService.sendDailyReminder();
    return { success: true, message: 'Daily reminder triggered' };
  }

  @Get('monthly')
  async triggerMonthlySummary(@Headers('x-vercel-cron-auth') authHeader: string) {
    this.verifyAuth(authHeader);
    
    this.logger.log('Manually triggering monthly summary via Vercel Cron endpoint');
    await this.notificationsService.sendMonthlySummary();
    return { success: true, message: 'Monthly summary triggered' };
  }

  private verifyAuth(authHeader: string) {
    const cronSecret = process.env.CRON_SECRET || 'family-cron-secret-2026';
    if (authHeader !== cronSecret) {
      this.logger.warn('Unauthorized attempt to trigger cron endpoint');
      throw new UnauthorizedException('Invalid cron secret');
    }
  }
}
