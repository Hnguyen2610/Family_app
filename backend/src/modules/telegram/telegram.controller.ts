import { Body, Controller, Get, Headers, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { TelegramService } from './telegram.service';
import { TelegramFootballNotificationService } from './services/telegram-football-notification.service';

@Controller('api/telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly footballNotificationService: TelegramFootballNotificationService,
    private readonly configService: ConfigService,
  ) {}

  @SkipThrottle()
  @Post('webhook')
  async handleWebhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string,
  ) {
    const expectedSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid Telegram webhook secret');
    }

    await this.telegramService.handleWebhookUpdate(update);
    return { ok: true };
  }

  @SkipThrottle()
  @Get('football-daily')
  async triggerFootballDaily(
    @Headers('x-vercel-cron-auth') customAuth: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.verifyCronAuth(customAuth, authHeader);
    const summary = await this.footballNotificationService.sendTodayFootballSchedule();
    return { ok: true, summary };
  }

  private verifyCronAuth(customAuth?: string, authHeader?: string) {
    const cronSecret = this.configService.get<string>('CRON_SECRET');
    if (!cronSecret) {
      throw new UnauthorizedException('Cron auth not configured');
    }
    if (customAuth === cronSecret) return;
    if (authHeader?.startsWith('Bearer ') && authHeader.slice(7) === cronSecret) return;
    if (authHeader === cronSecret) return;
    throw new UnauthorizedException('Invalid cron secret');
  }
}
