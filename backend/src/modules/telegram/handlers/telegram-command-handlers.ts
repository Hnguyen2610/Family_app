import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Telegraf, Context } from 'telegraf';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiStatsService } from '../../ai-agent/services/ai-stats.service';
import { TelegramSender } from '../services/telegram-sender';
import { TelegramContextService } from '../services/telegram-context.service';
import { TelegramAiResponder } from '../services/telegram-ai-responder.service';
import { TelegramFamilyNoteService } from '../services/telegram-family-note.service';
import {
  buildHelpMessage,
  buildWelcomeMessage,
} from '../telegram-messages';
import {
  getTelegramActiveFamilyId,
  getUserFamilies,
  resolveFamilySelection,
  toObject,
  getActiveFamily,
} from '../telegram-family.helpers';

@Injectable()
export class TelegramCommandHandlers {
  private readonly logger = new Logger(TelegramCommandHandlers.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: TelegramSender,
    private readonly context: TelegramContextService,
    private readonly aiResponder: TelegramAiResponder,
    private readonly noteService: TelegramFamilyNoteService,
    @Inject(forwardRef(() => AiStatsService))
    private readonly aiStatsService: AiStatsService,
  ) {}

  register(bot: Telegraf) {
    // start
    bot.start((ctx) => this.handleStart(ctx));

    // app
    bot.command('app', (ctx) => this.handleApp(ctx));

    // link_group
    bot.command('link_group', (ctx) => this.handleLinkGroup(ctx));

    // families
    bot.command('families', (ctx) => this.handleFamilies(ctx));

    // use_family
    bot.command('use_family', (ctx) => this.handleUseFamily(ctx));

    // status
    bot.command('status', (ctx) => this.handleStatus(ctx));

    // help
    bot.command('help', (ctx) => this.handleHelp(ctx));

    // gold
    bot.command('gold', (ctx) => this.handleGold(ctx));

    // football
    bot.command('football', (ctx) => this.handleFootball(ctx));

    // search
    bot.command('search', (ctx) => this.handleSearch(ctx));

    // today
    bot.command('today', (ctx) => this.aiResponder.replyWithTodayCommand(ctx));

    // week
    bot.command('week', (ctx) => this.handleWeek(ctx));

    // weather
    bot.command('weather', (ctx) => this.handleWeather(ctx));

    // note
    bot.command('note', (ctx) => this.handleNote(ctx));

    // menu
    bot.command('menu', (ctx) => this.handleMenu(ctx));

    // events
    bot.command('events', (ctx) => this.handleEvents(ctx));

    // events_next
    bot.command('events_next', (ctx) => this.handleEventsNext(ctx));

    // horoscope
    bot.command('horoscope', (ctx) => this.handleHoroscope(ctx));

    // stats
    bot.command('stats', (ctx) => this.handleStats(ctx));

    // reply keyboard text listeners
    bot.hears('⚽ Bóng Đá Hôm Nay', (ctx) => this.handleFootball(ctx));
    bot.hears('🔮 Tử Vi Tuần Này', (ctx) => this.handleHoroscope(ctx));
    bot.hears('👪 Xem Gia Đình', (ctx) => this.handleFamilies(ctx));
    bot.hears('📊 Trạng Thái Kết Nối', (ctx) => this.handleStatus(ctx));
    bot.hears('🟡 Giá Vàng Mới Nhất', (ctx) => this.handleGold(ctx));
    bot.hears('🍜 Thực Đơn Hôm Nay', (ctx) => this.handleMenu(ctx));
    bot.hears('📅 Lịch Trình Gia Đình', (ctx) => this.handleEvents(ctx));
    bot.hears('🔍 Tìm Kiếm Internet', (ctx) => this.handleSearchMenu(ctx));
    bot.hears('❓ Hướng Dẫn & Phím Tắt', (ctx) => this.handleHelp(ctx));
  }

  private async handleStart(ctx: Context) {
    const startPayload = (ctx as any).startPayload;
    const chatId = ctx.chat!.id.toString();
    const username = ctx.from!.username;
    const isGroup = ctx.chat!.type === 'group' || ctx.chat!.type === 'supergroup';

    if (isGroup) {
      await ctx.reply('👋 Chào cả nhà! Để nhận thông báo cho gia đình trong group này, hãy gõ lệnh: `/link_group [FamilyID]`');
      return;
    }

    if (startPayload) {
      try {
        const user = await this.prisma.user.update({
          where: { id: startPayload },
          data: { telegramChatId: chatId, telegramUsername: username },
          include: { family: true, families: true }
        });
        await ctx.reply(buildWelcomeMessage(user.name), { parse_mode: 'HTML' });
        await this.sender.sendAppMenu(ctx, user);
      } catch (error) {
        await ctx.reply('❌ Có lỗi xảy ra khi kết nối. Hãy thử lại từ web app.');
      }
    } else {
      const user = await this.context.getLinkedUser(chatId);
      if (user) {
        await this.sender.sendAppMenu(ctx, user);
      } else {
        await ctx.reply(buildHelpMessage('Chào mừng bạn đến với FamilyGPT Telegram. Hãy mở Settings trong web app để liên kết tài khoản trước.'), { parse_mode: 'HTML' });
      }
    }
  }

  private async handleApp(ctx: Context) {
    const user = await this.context.getLinkedUser(ctx.chat!.id.toString());
    if (!user) {
      await ctx.reply(buildHelpMessage('Chào mừng bạn đến với FamilyGPT Telegram. Hãy mở Settings trong web app để liên kết tài khoản trước.'), { parse_mode: 'HTML' });
      return;
    }
    await this.sender.sendAppMenu(ctx, user);
  }

  private async handleLinkGroup(ctx: Context) {
    const args = (ctx.message as any).text.split(' ');
    if (args.length < 2) return ctx.reply('Vui lòng gõ: `/link_group [ID_GIA_DINH]`');
    
    const familyId = args[1];
    const chatId = ctx.chat!.id.toString();

    try {
      await this.prisma.family.update({
        where: { id: familyId },
        data: { telegramGroupId: chatId },
      });
      await ctx.reply('✅ Đã kết nối Group này với Gia đình thành công! Mình sẽ gửi các thông báo chung vào đây.');
    } catch (err) {
      await ctx.reply('❌ Không tìm thấy Gia đình với ID này.');
    }
  }

  private async handleFamilies(ctx: Context) {
    const user = await this.context.getLinkedUser(ctx.chat!.id.toString());
    if (!user) {
      await ctx.reply('Bạn chưa kết nối tài khoản. Hay mở Telegram từ Settings trong web app trước.');
      return;
    }

    const activeFamilyId = getTelegramActiveFamilyId(user.notificationSettings);
    const families = getUserFamilies(user);
    if (!families.length) {
      await ctx.reply('Tài khoản này chưa vào gia đình nào.');
      return;
    }

    const lines = families.map((family, index) => {
      const active = family.id === activeFamilyId ? ' *' : '';
      return `${index + 1}. ${family.name}${active}\n   /use_family ${index + 1}\n   ID: ${family.id}`;
    });

    await ctx.reply(`Các gia đình bạn có thể chọn:\n\n${lines.join('\n\n')}`);
  }

  private async handleUseFamily(ctx: Context) {
    const user = await this.context.getLinkedUser(ctx.chat!.id.toString());
    if (!user) {
      await ctx.reply('Bạn chưa kết nối tài khoản. Hay mở Telegram từ Settings trong web app trước.');
      return;
    }

    const rawValue = (ctx.message as any).text.split(' ').slice(1).join(' ').trim();
    if (!rawValue) {
      await ctx.reply('Hãy gõ: /use_family <số thứ tự hoặc familyId>. Dùng /families để xem danh sách.');
      return;
    }

    const families = getUserFamilies(user);
    const family = resolveFamilySelection(families, rawValue);
    if (!family) {
      await ctx.reply('Không tìm thấy gia đình này. Dùng /families để xem danh sách hợp lệ.');
      return;
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        notificationSettings: {
          ...toObject(user.notificationSettings),
          telegram: {
            ...toObject(toObject(user.notificationSettings).telegram),
            activeFamilyId: family.id,
            activeFamilyName: family.name,
            updatedAt: new Date().toISOString(),
          },
        },
      },
    });

    await ctx.reply(`Đã chọn gia đình: ${family.name}. Các câu hỏi tiếp theo sẽ sử dụng family này.`);
  }

  private async handleStatus(ctx: Context) {
    const user = await this.context.getLinkedUser(ctx.chat!.id.toString());
    if (!user) {
      await ctx.reply('Telegram chưa liên kết với tài khoản Family App.');
      return;
    }

    const activeFamily = getActiveFamily(user);
    await ctx.reply([
      `Đã liên kết: ${user.name}`,
      `Gia đình đang dùng: ${activeFamily?.name || 'Chưa chọn'}`,
      'lệnh: /families, /use_family <số>, /status, /stats',
    ].join('\n'));
  }

  private async handleHelp(ctx: Context) {
    const user = await this.context.getLinkedUser(ctx.chat!.id.toString());
    const title = user
      ? `Xin chào <b>${user.name}</b>. Dưới đây là danh sách hướng dẫn chi tiết:`
      : 'Dưới đây là danh sách hướng dẫn chi tiết của Family Assistant:';
    await ctx.reply(buildHelpMessage(title), { parse_mode: 'HTML' });
  }

  private async handleGold(ctx: Context) {
    const user = await this.context.getLinkedUser(ctx.chat!.id.toString());
    const familyId = getActiveFamily(user)?.id || user?.familyId || 'all';

    try {
      await ctx.sendChatAction('typing');
      const response = await this.aiResponder.chatWithAi(familyId, 'gia vang hom nay', user, 'groq');
      await this.sender.replyWithAiFeedback(ctx, response.content, response.requestLogId, { parse_mode: 'Markdown' });
    } catch (err) {
      await ctx.reply('❌ Có lỗi khi lấy giá vàng.');
    }
  }

  private handleFootball(ctx: Context) {
    const rawText = ((ctx.message as any)?.text || '').trim();
    const userText = rawText.startsWith('/football') ? rawText.split(' ').slice(1).join(' ').trim() : '';
    return this.aiResponder.replyWithFootballCommand(ctx, userText);
  }

  private async handleSearch(ctx: Context) {
    const user = await this.context.getLinkedUser(ctx.chat!.id.toString());
    const familyId = getActiveFamily(user)?.id || user?.familyId || 'all';
    const query = (ctx.message as any).text.split(' ').slice(1).join(' ').trim();

    if (!query) {
      await ctx.reply('Hãy nhập từ khóa tìm kiếm. Ví dụ: /search giá iPhone 15');
      return;
    }

    try {
      await ctx.sendChatAction('typing');
      const response = await this.aiResponder.chatWithAi(familyId, `web search: ${query}`, user, 'gemini');
      await this.sender.replyWithAiFeedback(ctx, response.content, response.requestLogId);
    } catch (err: any) {
      this.logger.warn(`Telegram /search failed: ${err?.message || err}`);
      await ctx.reply('❌ Có lỗi khi tra cứu Internet.');
    }
  }

  private handleWeek(ctx: Context) {
    return this.aiResponder.replyWithAiCommand(
      ctx,
      'lich 7 ngay toi cua gia dinh, tra loi ngan gon cho Telegram',
      'Không xem được lịch 7 ngày tới lúc này. Hãy thử lại sau.',
      true,
      { hideSources: true },
    );
  }

  private handleWeather(ctx: Context) {
    const location = this.context.getCommandArgument(ctx);
    return this.aiResponder.replyWithWeatherCommand(ctx, location);
  }

  private handleNote(ctx: Context) {
    const content = this.context.getCommandArgument(ctx);
    if (!content) {
      return ctx.reply('Hãy gõ: /note <nội dung cần lưu vào sổ tay gia đình>.');
    }
    return this.noteService.replyWithFamilyNoteCommand(ctx, content);
  }

  private handleMenu(ctx: Context) {
    return this.aiResponder.replyWithAiCommand(
      ctx,
      'hom nay an gi',
      'Không gợi ý được thực đơn lúc này. Hãy thử lại sau.',
    );
  }

  private handleEvents(ctx: Context) {
    const rawText = ((ctx.message as any)?.text || '').trim();
    const request = rawText.startsWith('/events') ? rawText.split(' ').slice(1).join(' ').trim() : '';
    return this.aiResponder.replyWithAiCommand(
      ctx,
      request ? `lich ${request}` : 'lich thang nay',
      'Không xem được lịch lúc này. Hãy thử lại sau.',
    );
  }

  private handleEventsNext(ctx: Context) {
    return this.aiResponder.replyWithAiCommand(
      ctx,
      'lich thang sau',
      'Không xem được lịch tháng sau lúc này. Hãy thử lại sau.',
    );
  }

  private handleHoroscope(ctx: Context) {
    const rawText = ((ctx.message as any)?.text || '').trim();
    const question = rawText.startsWith('/horoscope') ? rawText.split(' ').slice(1).join(' ').trim() : '';
    return this.aiResponder.replyWithAiCommand(
      ctx,
      question ? `tử vi cá nhân của tôi: ${question}` : 'tử vi cá nhân của tôi tuần này',
      'Không xem được tử vi lúc này. Hay thử lại sau.',
    );
  }

  private async handleSearchMenu(ctx: Context) {
    await ctx.reply('🔍 Để tìm kiếm thông tin bằng AI trên Internet, hãy gõ lệnh:\n`/search <từ khóa cần tìm>`\nVí dụ: `/search thời tiết Hà Nội hôm nay`');
  }

  private async handleStats(ctx: Context) {
    const chatId = ctx.chat!.id.toString();
    const user = await this.prisma.user.findUnique({ where: { telegramChatId: chatId } });
    
    if (user?.globalRole !== 'SUPER_ADMIN') {
      await ctx.reply('🚫 Bạn không có quyền truy cập lệnh này.');
      return;
    }

    const stats = await this.aiStatsService.getSystemStats();
    const report = [
      '📊 <b>AI SYSTEM STATS</b>',
      `• Uptime: ${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`,
      `• Memory: ${stats.memoryMB} MB`,
      `• Cache: ${stats.cache.active} / ${stats.cache.total} entries`,
      `• Hit Rate: ${stats.logStats.total > 0 ? Math.round(stats.logStats.cacheHits / stats.logStats.total * 100) : 0}%`,
      `• Avg Latency: ${stats.logStats.avgLatencyMs}ms`,
      `• Errors: ${stats.logStats.errors}`,
    ].join('\n');

    await ctx.reply(report, { parse_mode: 'HTML' });
  }
}
