import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { AiAgentService } from '../../ai-agent/services/ai-agent.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { TelegramSender } from '../services/telegram-sender';
import { TelegramContextService } from '../services/telegram-context.service';
import { TelegramAiResponder } from '../services/telegram-ai-responder.service';
import { TelegramFamilyNoteService } from '../services/telegram-family-note.service';
import {
  getTelegramActiveFamilyId,
  getUserFamilies,
  getActiveFamily,
} from '../telegram-family.helpers';
import { buildHelpMessage } from '../telegram-messages';

@Injectable()
export class TelegramActionHandlers {
  private readonly logger = new Logger(TelegramActionHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: TelegramSender,
    private readonly context: TelegramContextService,
    private readonly aiResponder: TelegramAiResponder,
    private readonly noteService: TelegramFamilyNoteService,
    @Inject(forwardRef(() => AiAgentService))
    private readonly aiAgentService: AiAgentService,
  ) {}

  register(bot: Telegraf) {
    bot.action('menu_football', (ctx) => this.handleMenuFootball(ctx));
    bot.action('menu_horoscope', (ctx) => this.handleMenuHoroscope(ctx));
    bot.action('menu_families', (ctx) => this.handleMenuFamilies(ctx));
    bot.action('menu_status', (ctx) => this.handleMenuStatus(ctx));
    bot.action('menu_gold', (ctx) => this.handleMenuGold(ctx));
    bot.action('menu_meal', (ctx) => this.handleMenuMeal(ctx));
    bot.action('menu_events', (ctx) => this.handleMenuEvents(ctx));
    bot.action('menu_search', (ctx) => this.handleMenuSearch(ctx));
    bot.action('menu_help', (ctx) => this.handleMenuHelp(ctx));

    // Callback parameters
    bot.action(/^note_save:(.+)$/, (ctx) => this.handleNoteSave(ctx as any));
    bot.action(/^note_skip:(.+)$/, (ctx) => this.handleNoteSkip(ctx as any));
    bot.action(/^ai_feedback:([^:]+):(.+)$/, (ctx) => this.handleAiFeedback(ctx as any));
    bot.action(/^daily_task_done:(.+)$/, (ctx) => this.handleDailyTaskDone(ctx as any));
  }

  private async handleMenuFootball(ctx: Context) {
    await ctx.answerCbQuery();
    await this.aiResponder.replyWithFootballCommand(ctx);
  }

  private async handleMenuHoroscope(ctx: Context) {
    await ctx.answerCbQuery();
    await this.aiResponder.replyWithAiMenuAction(
      ctx,
      'tử vi cá nhân của tôi tuần này',
      '🔮 Đang lập lá số tử vi tuần này của bạn...',
      '❌ Có lỗi khi lập tử vi.',
      'gemini',
    );
  }

  private async handleMenuFamilies(ctx: Context) {
    await ctx.answerCbQuery();
    const user = await this.context.getLinkedUser(ctx.chat?.id?.toString() || '');
    if (!user) {
      await ctx.reply('Bạn chưa kết nối tài khoản. Hãy mở Settings trong web app để liên kết trước.');
      return;
    }
    const activeFamilyId = getTelegramActiveFamilyId(user.notificationSettings);
    const families = getUserFamilies(user);
    if (!families.length) {
      await ctx.reply('Tài khoản này chưa tham gia gia đình nào.');
      return;
    }
    const lines = families.map((family, index) => {
      const active = family.id === activeFamilyId ? ' *' : '';
      return `${index + 1}. ${family.name}${active}\n   /use_family ${index + 1}\n   ID: ${family.id}`;
    });
    await ctx.reply(`Các gia đình bạn có thể chọn:\n\n${lines.join('\n\n')}`);
  }

  private async handleMenuStatus(ctx: Context) {
    await ctx.answerCbQuery();
    const user = await this.context.getLinkedUser(ctx.chat?.id?.toString() || '');
    if (!user) {
      await ctx.reply('Telegram chưa liên kết với tài khoản Family App.');
      return;
    }
    const activeFamily = getActiveFamily(user);
    await ctx.reply([
      `Đã liên kết: ${user.name}`,
      `Gia đình đang dùng: ${activeFamily?.name || 'Chưa chọn'}`,
    ].join('\n'));
  }

  private async handleMenuGold(ctx: Context) {
    await ctx.answerCbQuery();
    await this.aiResponder.replyWithAiMenuAction(
      ctx,
      'gia vang hom nay',
      '🟡 Đang lấy giá vàng mới nhất...',
      '❌ Có lỗi khi lấy giá vàng.',
      'groq',
      { parse_mode: 'Markdown' },
    );
  }

  private async handleMenuMeal(ctx: Context) {
    await ctx.answerCbQuery();
    await this.aiResponder.replyWithAiMenuAction(
      ctx,
      'hom nay an gi',
      '🍜 Đang tìm món ngon gợi ý cho hôm nay...',
      '❌ Có lỗi khi gợi ý thực đơn.',
    );
  }

  private async handleMenuEvents(ctx: Context) {
    await ctx.answerCbQuery();
    await this.aiResponder.replyWithAiMenuAction(
      ctx,
      'lich thang nay',
      '📅 Đang lấy lịch trình của gia đình...',
      '❌ Có lỗi khi lấy lịch trình.',
    );
  }

  private async handleMenuSearch(ctx: Context) {
    await ctx.answerCbQuery();
    await ctx.reply('🔍 Để tìm kiếm thông tin bằng AI trên Internet, hãy gõ lệnh: \n`/search <từ khóa cần tìm>`\nVí dụ: `/search thời tiết Hà Nội hôm nay`');
  }

  private async handleMenuHelp(ctx: Context) {
    await ctx.answerCbQuery();
    const user = await this.context.getLinkedUser(ctx.chat?.id?.toString() || '');
    const title = user
      ? `Chào <b>${user.name}</b>! Dưới đây là danh sách phím tắt và hướng dẫn điều khiển chi tiết:`
      : 'Dưới đây là danh sách phím tắt và hướng dẫn điều khiển chi tiết của Family Assistant:';
    await ctx.reply(buildHelpMessage(title), { parse_mode: 'HTML' });
  }

  private async handleNoteSave(ctx: any) {
    const noteId = ctx.match?.[1];
    await this.noteService.handleSaveNoteAction(ctx, noteId);
  }

  private async handleNoteSkip(ctx: any) {
    const noteId = ctx.match?.[1];
    await this.noteService.handleSkipNoteAction(ctx, noteId);
  }

  private async handleAiFeedback(ctx: any) {
    const value = ctx.match?.[1];
    const requestLogId = ctx.match?.[2];
    const user = await this.context.getLinkedUser(ctx.from?.id?.toString() || '');
    const result = await this.aiAgentService.addFeedback({
      requestLogId,
      value,
      source: 'telegram',
      userId: user?.id,
    } as any);
    await ctx.answerCbQuery(result.ok ? 'Đã ghi nhận feedback' : 'Feedback đã hết hạn');
  }

  private async handleDailyTaskDone(ctx: any) {
    const taskId = ctx.match?.[1];
    const user = await this.context.getLinkedUser(ctx.from?.id?.toString() || '');
    if (!taskId || !user) {
      await ctx.answerCbQuery('Không tìm thấy tài khoản hoặc công việc');
      return;
    }

    const result = await this.prisma.dailyTask.updateMany({
      where: { id: taskId, userId: user.id },
      data: { completedAt: new Date() },
    });

    if (!result.count) {
      await ctx.answerCbQuery('Không tìm thấy công việc');
      return;
    }

    await ctx.answerCbQuery('Đã đánh dấu hoàn thành hôm nay');
    await ctx.editMessageReplyMarkup(undefined).catch(() => {});
  }
}
