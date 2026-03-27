import { Controller, Get, Post, Patch, Delete, Param, Query, Headers, UnauthorizedException, Logger, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService
  ) {}

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

  @Get()
  async getForUser(@Query('userId') userId: string) {
    return this.notificationsService.getForUser(userId);
  }

  @Patch(':id/read')
  async markAsRead(@Param('id') id: string, @Query('userId') userId: string) {
    return this.notificationsService.markAsRead(id, userId);
  }

  @Post('read-all')
  async markAllAsRead(@Query('userId') userId: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('userId') userId: string) {
    return this.notificationsService.delete(id, userId);
  }

  @Post('push/subscribe')
  async subscribePush(
    @Query('userId') userId: string,
    @Body() subscription: any
  ) {
    if (!userId) throw new UnauthorizedException('UserId required');
    const existing = await this.prisma.pushSubscription.findUnique({
      where: { endpoint: subscription.endpoint }
    });
    if (existing) {
      if (existing.userId !== userId) {
        await this.prisma.pushSubscription.update({
          where: { id: existing.id },
          data: { userId }
        });
      }
      return { success: true };
    }
    await this.prisma.pushSubscription.create({
      data: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    });
    return { success: true };
  }

  @Post('push/unsubscribe')
  async unsubscribePush(
    @Query('userId') userId: string,
    @Body() body: { endpoint: string }
  ) {
    if (!userId) throw new UnauthorizedException('UserId required');
    if (!body.endpoint) return { success: false };
    
    await this.prisma.pushSubscription.delete({
      where: { endpoint: body.endpoint }
    }).catch(() => {});
    return { success: true };
  }

  private verifyAuth(authHeader: string) {
    const cronSecret = process.env.CRON_SECRET || 'family-cron-secret-2026';
    if (authHeader !== cronSecret) {
      this.logger.warn('Unauthorized attempt to trigger cron endpoint');
      throw new UnauthorizedException('Invalid cron secret');
    }
  }
}
