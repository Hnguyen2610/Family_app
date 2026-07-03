import { Injectable } from '@nestjs/common';
import { Context } from 'telegraf';
import { PrismaService } from '../../../prisma/prisma.service';
import { getActiveFamily } from '../telegram-family.helpers';

export type TelegramCommandContext = {
  user: any;
  familyId: string;
  groupFamily?: { id: string; name: string } | null;
};

@Injectable()
export class TelegramContextService {
  constructor(private readonly prisma: PrismaService) {}

  getLinkedUser(chatId: string) {
    return this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      include: { families: true, family: true },
    });
  }

  getLinkedGroupFamily(chatId: string) {
    return this.prisma.family.findFirst({
      where: { telegramGroupId: chatId },
      select: { id: true, name: true },
    });
  }

  getCommandArgument(ctx: Context) {
    return String((ctx.message as any)?.text || '').split(' ').slice(1).join(' ').trim();
  }

  async getTelegramCommandContext(
    ctx: Context,
    requireLinked = true,
    options: { requireFamily?: boolean; hideSources?: boolean } = {},
  ): Promise<TelegramCommandContext | null> {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return null;

    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    const senderChatId = isGroup ? ctx.from?.id?.toString() : chatId;
    const [user, groupFamily] = await Promise.all([
      senderChatId ? this.getLinkedUser(senderChatId) : Promise.resolve(null),
      isGroup ? this.getLinkedGroupFamily(chatId) : Promise.resolve(null),
    ]);

    if (requireLinked && !user) {
      await ctx.reply(
        isGroup
          ? 'Bạn cần mở bot riêng, liên kết tài khoản Family App trước, rồi mới dùng lệnh này trong group.'
          : 'Bạn chưa kết nối tài khoản. Hãy mở Telegram từ Settings trong web app trước.',
      );
      return null;
    }

    if (options.requireFamily && isGroup && !groupFamily) {
      await ctx.reply('Group này chưa liên kết với family. Hãy dùng /link_group <familyId> trước.');
      return null;
    }

    const familyId = groupFamily?.id || getActiveFamily(user)?.id || user?.familyId || 'all';
    return { user, familyId, groupFamily };
  }
}
