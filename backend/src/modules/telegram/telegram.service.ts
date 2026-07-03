import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf } from 'telegraf';
import { TelegramSender } from './services/telegram-sender';
import { TelegramCommandHandlers } from './handlers/telegram-command-handlers';
import { TelegramActionHandlers } from './handlers/telegram-action-handlers';
import { TelegramMessageHandlers } from './handlers/telegram-message-handlers';
import { TELEGRAM_COMMANDS } from './telegram-messages';

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot!: Telegraf;
  private readonly logger = new Logger(TelegramService.name);
  private handlersReady = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly sender: TelegramSender,
    private readonly commandHandlers: TelegramCommandHandlers,
    private readonly actionHandlers: TelegramActionHandlers,
    private readonly messageHandlers: TelegramMessageHandlers,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Telegraf(token);
      this.sender.setBot(this.bot);
    } else {
      this.logger.warn('TELEGRAM_BOT_TOKEN not found in environment variables');
    }
  }

  async onModuleInit() {
    if (this.bot) {
      try {
        this.setupHandlers();
        // Do not await these calls in Serverless startup to avoid blocking or 429 crashes
        this.bot.telegram.setMyCommands(TELEGRAM_COMMANDS).catch(() => {});

        const webhookUrl = this.configService.get<string>('TELEGRAM_WEBHOOK_URL');
        const webhookSecret = this.configService.get<string>('TELEGRAM_WEBHOOK_SECRET');
        const usePolling = this.configService.get<string>('TELEGRAM_USE_POLLING') === 'true';
        const isProduction = this.configService.get<string>('NODE_ENV') === 'production' || !!process.env.VERCEL;

        if (webhookUrl) {
          void this.ensureWebhookConfigured(webhookUrl, webhookSecret);
          return;
        }

        if (!isProduction || usePolling) {
          this.launchPolling().catch(err => {
            this.logger.error('Failed to launch Telegram bot', err);
          });
          this.logger.log('Telegram bot initialized with polling and AI capabilities');
          return;
        }

        this.logger.warn('Telegram bot token found, but TELEGRAM_WEBHOOK_URL is missing. Polling is disabled in production.');
      } catch (error) {
        this.logger.error('Telegram bot init failed, but continuing to prevent app crash', error);
      }
    }
  }

  private async ensureWebhookConfigured(webhookUrl: string, webhookSecret?: string) {
    try {
      const current = await this.bot.telegram.getWebhookInfo();
      if (current.url === webhookUrl) {
        this.logger.log('Telegram bot webhook already configured');
        return;
      }

      await this.bot.telegram.setWebhook(
        webhookUrl,
        webhookSecret ? { secret_token: webhookSecret } : undefined,
      );
      this.logger.log(`Telegram bot webhook configured: ${webhookUrl}`);
    } catch (err: any) {
      const message = err?.message || String(err);
      const retryAfter = err?.parameters?.retry_after || err?.response?.parameters?.retry_after;
      const retrySuffix = retryAfter ? `; retry after ${retryAfter}s` : '';
      this.logger.warn(`Telegram webhook check/update skipped: ${message}${retrySuffix}`);
    }
  }

  private async launchPolling() {
    try {
      await this.bot.telegram.deleteWebhook();
    } catch (err: any) {
      this.logger.warn(`Telegram deleteWebhook before polling skipped: ${err?.message || err}`);
    }
    await this.bot.launch();
  }

  private setupHandlers() {
    if (!this.bot || this.handlersReady) return;
    this.handlersReady = true;

    this.commandHandlers.register(this.bot);
    this.actionHandlers.register(this.bot);
    this.messageHandlers.register(this.bot);
  }

  async handleWebhookUpdate(update: any) {
    if (!this.bot) return;
    this.setupHandlers();
    await this.bot.handleUpdate(update);
  }

  async sendMessageToUser(userId: string, message: string) {
    return this.sender.sendMessageToUser(userId, message);
  }

  async sendMessageToFamily(familyId: string, message: string) {
    return this.sender.sendMessageToFamily(familyId, message);
  }
}
