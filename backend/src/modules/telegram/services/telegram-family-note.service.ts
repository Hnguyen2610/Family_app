import { Injectable, Logger } from '@nestjs/common';
import { Context, Markup } from 'telegraf';
import { PrismaService } from '../../../prisma/prisma.service';
import { RagService } from '../../ai-agent/services/rag.service';
import { TelegramSender } from './telegram-sender';
import { TelegramContextService } from './telegram-context.service';
import { toObject, getActiveFamily } from '../telegram-family.helpers';
import { buildTelegramNoteDraft, shouldProposeTelegramFamilyNote } from '../telegram-note-draft';

export type PendingTelegramFamilyNote = {
  familyId: string;
  userId?: string;
  title: string;
  content: string;
  category: string;
  createdAt: number;
};

@Injectable()
export class TelegramFamilyNoteService {
  private readonly logger = new Logger(TelegramFamilyNoteService.name);
  private readonly pendingFamilyNotes = new Map<string, PendingTelegramFamilyNote>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    private readonly sender: TelegramSender,
    private readonly context: TelegramContextService,
  ) {}

  getPendingFamilyNote(user: any, noteId?: string): PendingTelegramFamilyNote | undefined {
    if (!noteId) return undefined;
    const memoryPending = this.pendingFamilyNotes.get(noteId);
    if (memoryPending?.userId === user.id) return memoryPending;

    const settings = toObject(user.notificationSettings);
    const stored = toObject(settings.telegramPendingFamilyNotes);
    const pending = stored[noteId] as PendingTelegramFamilyNote | undefined;
    return pending?.userId === user.id ? pending : undefined;
  }

  async persistPendingFamilyNote(user: any, noteId: string, pending: PendingTelegramFamilyNote) {
    const settings = toObject(user.notificationSettings);
    const stored = toObject(settings.telegramPendingFamilyNotes);
    const now = Date.now();
    const cleaned = Object.fromEntries(
      Object.entries(stored).filter(([, value]: any) => now - Number(value?.createdAt || 0) <= 30 * 60 * 1000),
    );

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        notificationSettings: {
          ...settings,
          telegramPendingFamilyNotes: {
            ...cleaned,
            [noteId]: pending,
          },
        },
      },
    });
  }

  async removePendingFamilyNote(userId: string, notificationSettings: any, noteId?: string) {
    if (!noteId) return;
    this.pendingFamilyNotes.delete(noteId);

    const settings = toObject(notificationSettings);
    const stored = { ...toObject(settings.telegramPendingFamilyNotes) };
    delete stored[noteId];

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        notificationSettings: {
          ...settings,
          telegramPendingFamilyNotes: stored,
        },
      },
    });
  }

  async tryReplyWithTelegramFamilyNoteProposal(ctx: Context, text: string): Promise<boolean> {
    if (!shouldProposeTelegramFamilyNote(text)) return false;

    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return false;

    const user = await this.context.getLinkedUser(chatId);
    if (!user) {
      await ctx.reply('Bạn chưa kết nối tài khoản. Hãy mở Telegram từ Settings trong web app trước.');
      return true;
    }

    const activeFamily = getActiveFamily(user);
    if (!activeFamily) {
      await ctx.reply('Hãy chọn family trước bằng /families và /use_family.');
      return true;
    }

    const note = buildTelegramNoteDraft(text);
    const noteId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const pending = {
      familyId: activeFamily.id,
      userId: user.id,
      title: note.title,
      content: note.content,
      category: note.category,
      createdAt: Date.now(),
    };
    this.pendingFamilyNotes.set(noteId, pending);
    await this.persistPendingFamilyNote(user, noteId, pending);

    await ctx.reply(
      [
        'Mình chưa lưu ngay. Bạn có muốn lưu ghi chú này vào sổ tay gia đình không?',
        `Family: ${activeFamily.name}`,
        `Title: ${note.title}`,
        `Category: ${note.category}`,
      ].join('\n'),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Lưu', `note_save:${noteId}`),
          Markup.button.callback('Bỏ qua', `note_skip:${noteId}`),
        ],
      ]),
    );
    return true;
  }

  async replyWithFamilyNoteCommand(ctx: Context, content: string) {
    const commandContext = await this.context.getTelegramCommandContext(ctx, true);
    if (!commandContext) return;

    const activeFamily = commandContext.groupFamily || getActiveFamily(commandContext.user);
    if (!activeFamily) {
      await ctx.reply('Hãy chọn family trước bằng /families và /use_family.');
      return;
    }

    const note = buildTelegramNoteDraft(`lưu vào sổ tay ${content}`);
    const noteId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const pending = {
      familyId: activeFamily.id,
      userId: commandContext.user.id,
      title: note.title,
      content: note.content,
      category: note.category,
      createdAt: Date.now(),
    };

    this.pendingFamilyNotes.set(noteId, pending);
    await this.persistPendingFamilyNote(commandContext.user, noteId, pending);

    await ctx.reply(
      [
        'Mình chưa lưu ngay. Bạn có muốn lưu ghi chú này vào sổ tay gia đình không?',
        `Family: ${activeFamily.name}`,
        `Title: ${note.title}`,
        `Category: ${note.category}`,
      ].join('\n'),
      Markup.inlineKeyboard([
        [
          Markup.button.callback('Lưu', `note_save:${noteId}`),
          Markup.button.callback('Bỏ qua', `note_skip:${noteId}`),
        ],
      ]),
    );
  }

  async handleSaveNoteAction(ctx: Context, noteId: string) {
    const fromId = ctx.from?.id?.toString() || '';
    const user = await this.context.getLinkedUser(fromId);
    if (!user) {
      await ctx.reply('Bạn chưa kết nối tài khoản Family App.');
      return;
    }

    const pending = this.getPendingFamilyNote(user, noteId);
    if (!pending) {
      await ctx.reply('Đề xuất này đã hết hạn hoặc đã được xử lý.');
      return;
    }
    if (Date.now() - pending.createdAt > 30 * 60 * 1000) {
      await this.removePendingFamilyNote(user.id, user.notificationSettings, noteId);
      await ctx.reply('Đề xuất này đã hết hạn hoặc đã được xử lý.');
      return;
    }

    if (user.id !== pending.userId) {
      await ctx.reply('Chỉ người tạo đề xuất mới có thể lưu ghi chú này.');
      return;
    }

    await this.ragService.createKnowledgeDocument({
      familyId: pending.familyId,
      title: pending.title,
      content: pending.content,
      sourceType: 'telegram_consent',
      createdBy: pending.userId,
      metadata: { category: pending.category, source: 'telegram_button' },
    });

    await this.removePendingFamilyNote(user.id, user.notificationSettings, noteId);
    await ctx.reply(`Đã lưu vào sổ tay gia đình: ${pending.title}`);
  }

  async handleSkipNoteAction(ctx: Context, noteId: string) {
    const fromId = ctx.from?.id?.toString() || '';
    const user = await this.context.getLinkedUser(fromId);
    if (user) {
      await this.removePendingFamilyNote(user.id, user.notificationSettings, noteId);
    } else {
      this.pendingFamilyNotes.delete(noteId);
    }
    await ctx.reply('Đã bỏ qua đề xuất lưu ghi chú.');
  }
}
