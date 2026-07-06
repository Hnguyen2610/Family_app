import { Injectable, Logger } from '@nestjs/common';
import { Telegraf, Context, Markup } from 'telegraf';
import { PrismaService } from '../../../prisma/prisma.service';
import { TELEGRAM_FEEDBACK_OPTIONS } from '../telegram-messages';

export interface TelegramSendResult {
  ok: boolean;
  reason?: string;
  error?: string;
}

@Injectable()
export class TelegramSender {
  private bot!: Telegraf;
  private readonly logger = new Logger(TelegramSender.name);

  constructor(private prisma: PrismaService) {}

  setBot(bot: Telegraf) {
    this.bot = bot;
  }

  async sendAppMenu(ctx: Context, user: any) {
    const welcome = `👋 <b>Chào ${user.name}!</b>\nMình là Family Assistant. Chọn một phím chức năng tương ứng để lấy thông tin nhanh nhé:`;
    try {
      await ctx.reply(welcome, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback('⚽ Bóng Đá Hôm Nay', 'menu_football'),
            Markup.button.callback('🔮 Tử Vi Tuần Này', 'menu_horoscope'),
          ],
          [
            Markup.button.callback('👪 Xem Gia Đình', 'menu_families'),
            Markup.button.callback('📊 Trạng Thái Kết Nối', 'menu_status'),
          ],
          [
            Markup.button.callback('🟡 Giá Vàng Mới Nhất', 'menu_gold'),
            Markup.button.callback('🍜 Thực Đơn Hôm Nay', 'menu_meal'),
          ],
          [
            Markup.button.callback('📅 Lịch Trình Gia Đình', 'menu_events'),
            Markup.button.callback('🔍 Tìm Kiếm Internet', 'menu_search'),
          ],
          [
            Markup.button.callback('❓ Hướng Dẫn & Phím Tắt', 'menu_help'),
          ]
        ])
      });
    } catch (err) {
      this.logger.error('Failed to send App Menu', err);
    }
  }

  async replyWithAiFeedback(ctx: Context, content: string, requestLogId?: string, extra?: any) {
    if (!requestLogId) return ctx.reply(content, extra);
    const keyboard = Markup.inlineKeyboard([
      TELEGRAM_FEEDBACK_OPTIONS.slice(0, 2).map((option) =>
        Markup.button.callback(option.label, `ai_feedback:${option.value}:${requestLogId}`),
      ),
      TELEGRAM_FEEDBACK_OPTIONS.slice(2).map((option) =>
        Markup.button.callback(option.label, `ai_feedback:${option.value}:${requestLogId}`),
      ),
    ]);
    return ctx.reply(
      content,
      { ...(extra || {}), ...keyboard },
    );
  }

  async sendMessageToUser(userId: string, message: string) {
    if (!this.bot) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (user?.telegramChatId) {
      try {
        await this.bot.telegram.sendMessage(user.telegramChatId, message, { parse_mode: 'HTML' });
        return true;
      } catch { return false; }
    }
    return false;
  }

  async sendDailyTaskReminderToUser(
    userId: string,
    message: string,
    taskId: string,
  ): Promise<TelegramSendResult> {
    if (!this.bot) {
      this.logger.warn(`[DailyTaskReminder] Telegram bot is not ready for user ${userId}`);
      return { ok: false, reason: 'telegram_bot_not_ready' };
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { telegramChatId: true },
    });
    if (!user?.telegramChatId) {
      this.logger.warn(`[DailyTaskReminder] User ${userId} has no linked telegramChatId`);
      return { ok: false, reason: 'telegram_chat_not_linked' };
    }

    try {
      await this.bot.telegram.sendMessage(user.telegramChatId, message, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('✅ Xong', `daily_task_done:${taskId}`)],
        ]),
      });
      return { ok: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[DailyTaskReminder] Failed to send Telegram reminder to user ${userId}: ${errorMessage}`);
      return { ok: false, reason: 'telegram_send_failed', error: errorMessage };
    }
  }

  async sendMessageToFamily(familyId: string, message: string) {
    if (!this.bot) return false;
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { telegramGroupId: true },
    });
    if (family?.telegramGroupId) {
      try {
        await this.bot.telegram.sendMessage(family.telegramGroupId, message, { parse_mode: 'HTML' });
        return true;
      } catch { return false; }
    }
    return false;
  }
}
