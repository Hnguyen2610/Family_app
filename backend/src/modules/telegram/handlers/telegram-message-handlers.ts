import { Injectable, Logger } from '@nestjs/common';
import { Context, Telegraf } from 'telegraf';
import { TelegramSender } from '../services/telegram-sender';
import { TelegramContextService } from '../services/telegram-context.service';
import { TelegramAiResponder } from '../services/telegram-ai-responder.service';
import { TelegramFamilyNoteService } from '../services/telegram-family-note.service';
import { getActiveFamily } from '../telegram-family.helpers';
import { classifyAiIntent } from '../../ai-agent/ai-intent-router';

@Injectable()
export class TelegramMessageHandlers {
  private readonly logger = new Logger(TelegramMessageHandlers.name);
  private bot!: Telegraf;

  constructor(
    private readonly sender: TelegramSender,
    private readonly context: TelegramContextService,
    private readonly aiResponder: TelegramAiResponder,
    private readonly noteService: TelegramFamilyNoteService,
  ) {}

  register(bot: Telegraf) {
    this.bot = bot;

    // Generic text message
    bot.on('text', (ctx) => this.handleText(ctx));

    // Photo/Document messages
    bot.on(['photo', 'document'], (ctx) => this.handleMedia(ctx));
  }

  private async handleText(ctx: Context) {
    const text = ctx.message && 'text' in ctx.message ? ctx.message.text : '';
    if (!text) return;

    const isGroup = ctx.chat!.type === 'group' || ctx.chat!.type === 'supergroup';

    if (isGroup) {
      const route = classifyAiIntent(text);
      if (route.intent !== 'event_mutation') return;

      await this.aiResponder.replyWithAiCommand(
        ctx,
        `Yêu cầu lịch trong group family. Nếu tạo sự kiện, dùng scope FAMILY trừ khi người dùng nói rõ là riêng tư. Nội dung: ${text}`,
        'Không xử lý được yêu cầu lịch lúc này. Hãy thử lại sau.',
        true,
        { requireFamily: true },
      );
      return;
    }

    if (await this.noteService.tryReplyWithTelegramFamilyNoteProposal(ctx, text)) {
      return;
    }

    await this.aiResponder.replyWithAiCommand(
      ctx,
      text,
      '😅 Xin lỗi, trợ lý AI đang bận một chút, hãy thử lại sau nhé!',
    );
  }

  private async handleMedia(ctx: Context) {
    if (!ctx.message) return;

    const isGroup = ctx.chat!.type === 'group' || ctx.chat!.type === 'supergroup';
    const chatId = ctx.chat!.id.toString();
    const senderId = isGroup ? ctx.from?.id?.toString() : chatId;

    const user = senderId ? await this.context.getLinkedUser(senderId) : null;
    if (!user) {
      await ctx.reply('Bạn cần liên kết tài khoản trước khi gửi file cho AI.');
      return;
    }

    const activeFamily = getActiveFamily(user);
    if (!activeFamily) return;

    // Extract image
    let fileId = '';
    if ('photo' in ctx.message) {
      fileId = ctx.message.photo.pop()?.file_id || '';
    } else if ('document' in ctx.message && (ctx.message.document.mime_type?.startsWith('image/') || ctx.message.document.mime_type === 'application/pdf')) {
      fileId = ctx.message.document.file_id;
    }

    if (!fileId) return;

    const caption = (ctx.message as any).caption || '';

    try {
      await ctx.sendChatAction('upload_photo');
      const fileLink = await this.bot.telegram.getFileLink(fileId);
      
      await ctx.sendChatAction('typing');
      const response = await this.aiResponder.chatWithAi(
        activeFamily.id,
        caption || 'Bạn thấy gì trong này?',
        user,
        'gemini',
        fileLink.href,
      );
      
      await this.sender.replyWithAiFeedback(ctx, response.content, response.requestLogId);
    } catch (error) {
      this.logger.error('Telegram vision error', error);
      await ctx.reply('😅 Lỗi khi xử lý hình ảnh, hãy thử lại sau nhé!');
    }
  }
}
