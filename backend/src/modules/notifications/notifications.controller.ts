import { Controller, Get, Post, Patch, Delete, Param, Query, Headers, UnauthorizedException, Logger, Body } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { NotificationsService } from './notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationLogService } from './notification-log.service';
import { getIctNow } from '../../utils/timezone.util';

@Controller('api/notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly prisma: PrismaService,
    private readonly notificationLogService: NotificationLogService
  ) {}

  @SkipThrottle()
  @Get('daily')
  async triggerDailyReminder(
    @Headers('x-vercel-cron-auth') customAuth: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.verifyAuth(customAuth, authHeader);
    
    // Use ICT local date to check day of week/month
    const now = getIctNow();
    const dayOfWeek = now.getDay(); // 0 (Sun) to 6 (Sat)
    const dateOfMonth = now.getDate();

    this.logger.log(`Vercel Cron Trigger [${now.toISOString()}]: ICT Day=${dayOfWeek}, Date=${dateOfMonth}`);

    const tasks: Array<{ name: string; run: () => Promise<unknown> }> = [
      {
        name: 'dailyReminder',
        run: () => this.notificationsService.sendDailyReminder(),
      },
      {
        name: 'proactiveAssistant',
        run: () => this.notificationsService.runProactiveAssistant(),
      },
    ];
    
    // 2. If Monday (1), trigger Super Admin Weekly Horoscope
    if (dayOfWeek === 1) {
      tasks.push({
        name: 'weeklyHoroscope',
        run: () => this.notificationsService.sendWeeklyHoroscope(),
      });
    }

    // 3. If 1st of month, trigger Monthly Summary
    if (dateOfMonth === 1) {
      tasks.push({
        name: 'monthlySummary',
        run: () => this.notificationsService.sendMonthlySummary(),
      });
    }

    const results = await Promise.allSettled(
      tasks.map(async (task) => {
        this.logger.log(`Triggering ${task.name}...`);
        await task.run();
        return task.name;
      }),
    );

    const taskStatus = tasks.reduce<Record<string, boolean>>((acc, task, index) => {
      const result = results[index];
      const ok = result.status === 'fulfilled';
      acc[task.name] = ok;
      if (!ok) {
        this.logger.error(`Failed to execute ${task.name}`, result.reason);
      }
      return acc;
    }, {});
    
    return { 
      success: results.every((result) => result.status === 'fulfilled'),
      message: 'Morning notifications processed',
      tasks: taskStatus,
    };
  }

  @SkipThrottle()
  @Get('finance-report')
  async triggerMonthlyFinanceReport(
    @Headers('x-vercel-cron-auth') customAuth: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.verifyAuth(customAuth, authHeader);
    
    this.logger.log('Manually triggering monthly finance report via Vercel Cron endpoint');
    await this.notificationsService.sendMonthlyFinanceReport();
    return { success: true, message: 'Monthly finance report triggered' };
  }

  @SkipThrottle()
  @Get('delivery-logs')
  async getDeliveryLogs(
    @Query('userId') userId?: string,
    @Query('familyId') familyId?: string,
    @Query('limit') limit?: string,
  ) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.notificationLogService.getLogs({ userId, familyId, limit: lim });
  }

  @Get()
  async getForUser(@Query('userId') userId: string) {
    return this.notificationsService.getForUser(userId);
  }

  @Patch(':id/read')
  @Post(':id/read')
  async markAsRead(@Param('id') id: string, @Query('userId') userId: string) {
    if (!userId) throw new UnauthorizedException('userId is required');
    return this.notificationsService.markAsRead(id, userId);
  }

  @Post('read-all')
  async markAllAsRead(@Query('userId') userId?: string) {
    return this.notificationsService.markAllAsRead(userId);
  }

  @Delete('all')
  async deleteAll(@Query('userId') userId: string) {
    return this.notificationsService.deleteAll(userId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Query('userId') userId: string) {
    return this.notificationsService.delete(id, userId);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
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

  private verifyAuth(customAuth: string, authHeader: string) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      this.logger.warn('CRON_SECRET is not set — rejecting cron endpoint request');
      throw new UnauthorizedException('Cron auth not configured');
    }

    // Check custom header
    if (customAuth === cronSecret) return;
    
    // Check standard Authorization header (Bearer token)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === cronSecret) return;
    }
    
    // Check if Authorization header is just the secret itself
    if (authHeader === cronSecret) return;

    this.logger.warn('Unauthorized attempt to trigger cron endpoint (missing or invalid credentials)');
    throw new UnauthorizedException('Invalid cron secret');
  }
}
