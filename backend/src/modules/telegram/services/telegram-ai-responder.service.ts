import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Context } from 'telegraf';
import { AiAgentService } from '../../ai-agent/services/ai-agent.service';
import { WeatherService } from '../../weather/weather.service';
import { TelegramSender } from './telegram-sender';
import { TelegramContextService } from './telegram-context.service';
import { getActiveFamily } from '../telegram-family.helpers';
import {
  buildFootballWebSearchQuery,
  formatTelegramWeather,
  isFootballNoDataResponse,
  sanitizeTelegramFootballReply,
  sanitizeTelegramReply,
} from '../telegram-formatters';

@Injectable()
export class TelegramAiResponder {
  private readonly logger = new Logger(TelegramAiResponder.name);

  constructor(
    @Inject(forwardRef(() => AiAgentService))
    private readonly aiAgentService: AiAgentService,
    private readonly weatherService: WeatherService,
    private readonly sender: TelegramSender,
    private readonly context: TelegramContextService,
  ) {}

  private getTelegramSourceMode(ctx: Context): 'telegram_group' | 'telegram_private' {
    return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'
      ? 'telegram_group'
      : 'telegram_private';
  }

  async chatWithAi(
    familyId: string,
    prompt: string,
    user: { id?: string } | null | undefined,
    model: 'groq' | 'gemini' = 'groq',
    imageUrl?: string,
    sourceMode: 'telegram_group' | 'telegram_private' = 'telegram_private',
  ) {
    return this.aiAgentService.chat(
      familyId,
      prompt,
      user?.id ? [user.id] : undefined,
      imageUrl,
      model,
      undefined,
      sourceMode,
    );
  }

  async replyWithAiCommand(
    ctx: Context,
    prompt: string,
    fallbackMessage: string,
    requireLinked = true,
    options: { requireFamily?: boolean; hideSources?: boolean } = {},
  ) {
    const commandContext = await this.context.getTelegramCommandContext(ctx, requireLinked, options);
    if (!commandContext) return;

    try {
      await ctx.sendChatAction('typing');
      const response = await this.chatWithAi(commandContext.familyId, prompt, commandContext.user, 'groq', undefined, this.getTelegramSourceMode(ctx));
      await this.replyWithAiResponse(ctx, response, prompt, options);
    } catch (error) {
      this.logger.error(`Telegram AI command error: ${prompt}`, error);
      await ctx.reply(fallbackMessage);
    }
  }

  async replyWithTodayCommand(ctx: Context) {
    const commandContext = await this.context.getTelegramCommandContext(ctx, true);
    if (!commandContext) return;

    try {
      await ctx.sendChatAction('typing');
      const [aiResponse, weather] = await Promise.all([
        this.chatWithAi(
          commandContext.familyId,
          'lich hom nay cua gia dinh va viec can chu y, tra loi ngan gon cho Telegram',
          commandContext.user,
          'groq',
          undefined,
          this.getTelegramSourceMode(ctx),
        ),
        this.weatherService.getHeaderSummary(),
      ]);

      const lines = [
        'Hôm nay',
        '',
        sanitizeTelegramReply(aiResponse.content, 'lich hom nay', { hideSources: true }),
        '',
        formatTelegramWeather(weather),
      ].filter((line) => line !== '');

      await this.sender.replyWithAiFeedback(ctx, lines.join('\n'), aiResponse.requestLogId);
    } catch (error) {
      this.logger.error('Telegram /today failed', error);
      await ctx.reply('Không xem được tổng quan hôm nay lúc này. Hãy thử lại sau.');
    }
  }

  async replyWithWeatherCommand(ctx: Context, location?: string) {
    try {
      await ctx.sendChatAction('typing');
      const weather = await this.weatherService.getHeaderSummary(location || undefined);
      await ctx.reply(formatTelegramWeather(weather));
    } catch (error) {
      this.logger.error(`Telegram /weather failed: ${location || 'default'}`, error);
      await ctx.reply('Không lấy được thời tiết lúc này. Hãy thử lại sau.');
    }
  }

  async replyWithFootballCommand(ctx: Context, userText = '') {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return;

    const user = await this.context.getLinkedUser(chatId);
    const familyId = getActiveFamily(user)?.id || user?.familyId || 'all';
    const query = userText ? `lịch thi đấu bóng đá ${userText}` : 'lịch thi đấu bóng đá hôm nay';

    try {
      await ctx.reply('Đang lấy lịch thi đấu bóng đá hôm nay...');
      await ctx.sendChatAction('typing');
      const response = await this.chatWithAi(familyId, query, user, 'groq', undefined, this.getTelegramSourceMode(ctx));

      if (!isFootballNoDataResponse(response.content)) {
        await this.sender.replyWithAiFeedback(
          ctx,
          sanitizeTelegramFootballReply(response.content),
          response.requestLogId,
        );
        return;
      }

      this.logger.warn(`Football-Data had no usable matches, falling back to Tavily search: ${response.content}`);
      await ctx.sendChatAction('typing');
      const fallback = await this.chatWithAi(familyId, buildFootballWebSearchQuery(userText), user, 'gemini', undefined, this.getTelegramSourceMode(ctx));
      await this.sender.replyWithAiFeedback(
        ctx,
        sanitizeTelegramFootballReply(fallback.content),
        fallback.requestLogId,
      );
    } catch (error: any) {
      this.logger.warn(`Telegram /football failed: ${error?.message || error}`);
      await ctx.reply('Có lỗi khi lấy dữ liệu bóng đá.');
    }
  }

  async replyWithAiMenuAction(
    ctx: Context,
    prompt: string,
    loadingMessage: string,
    fallbackMessage: string,
    model: 'groq' | 'gemini' = 'groq',
    replyOptions?: any,
  ) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return;

    const user = await this.context.getLinkedUser(chatId);
    const familyId = getActiveFamily(user)?.id || user?.familyId || 'all';

    try {
      await ctx.reply(loadingMessage);
      await ctx.sendChatAction('typing');
      const response = await this.chatWithAi(familyId, prompt, user, model, undefined, this.getTelegramSourceMode(ctx));
      await this.replyWithAiResponse(ctx, response, prompt, {}, replyOptions);
    } catch (error) {
      this.logger.error(`Telegram menu action error: ${prompt}`, error);
      await ctx.reply(fallbackMessage);
    }
  }

  private async replyWithAiResponse(
    ctx: Context,
    response: any,
    prompt: string,
    options: { hideSources?: boolean } = {},
    replyOptions?: any,
  ) {
    const content = sanitizeTelegramReply(response.content, prompt, options);
    if (!response.proposal?.proposalId) {
      await this.sender.replyWithAiFeedback(ctx, content, response.requestLogId, replyOptions);
      return;
    }

    const proposal = response.proposal;
    let proposalText = '\n\n<b>📢 YÊU CẦU XÁC NHẬN</b>';
    if (proposal.summary) {
      proposalText += `\n${proposal.summary}`;
    }

    if (proposal.riskLevel === 'high') {
      proposalText += '\n⚠️ <b>Mức độ: Rủi ro cao / xóa dữ liệu</b>';
    } else if (proposal.riskLevel === 'medium') {
      proposalText += '\n⚡ <b>Mức độ: Thay đổi dữ liệu</b>';
    }

    if (proposal.before && proposal.after) {
      proposalText += '\n\n<b>Chi tiết thay đổi:</b>';
      const allKeys = Array.from(new Set([...Object.keys(proposal.before), ...Object.keys(proposal.after)]));
      for (const key of allKeys) {
        if (['id', 'createdAt', 'updatedAt', 'userId', 'familyId', 'creatorId', 'updaterId'].includes(key)) continue;
        const bVal = proposal.before[key] !== undefined ? String(proposal.before[key] || '-') : '-';
        const aVal = proposal.after[key] !== undefined ? String(proposal.after[key] || '-') : '-';
        if (bVal !== aVal) {
          proposalText += `\n- ${key}: <s>${bVal}</s> -> <b>${aVal}</b>`;
        }
      }
    } else if (proposal.before) {
      proposalText += '\n\n<b>Dữ liệu sẽ xóa:</b>';
      for (const [key, value] of Object.entries(proposal.before)) {
        if (['id', 'createdAt', 'updatedAt', 'userId', 'familyId', 'creatorId', 'updaterId'].includes(key)) continue;
        proposalText += `\n- ${key}: <s>${String(value || '-')}</s>`;
      }
    } else if (proposal.after) {
      proposalText += '\n\n<b>Chi tiết tạo mới:</b>';
      for (const [key, value] of Object.entries(proposal.after)) {
        if (['id', 'createdAt', 'updatedAt', 'userId', 'familyId', 'creatorId', 'updaterId'].includes(key)) continue;
        proposalText += `\n- ${key}: <b>${String(value || '-')}</b>`;
      }
    }

    await ctx.reply(content + proposalText, {
      parse_mode: 'HTML',
      ...replyOptions,
      reply_markup: {
        inline_keyboard: [
          [
            { text: 'Xác nhận', callback_data: `proposal_confirm:${proposal.proposalId}` },
            { text: 'Hủy', callback_data: `proposal_reject:${proposal.proposalId}` },
          ],
        ],
      },
    });
  }
}
