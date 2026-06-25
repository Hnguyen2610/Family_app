import { Injectable, OnModuleInit, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Context } from 'telegraf';
import { PrismaService } from '../../prisma/prisma.service';
import { AiAgentService } from '../ai-agent/services/ai-agent.service';
import { classifyAiIntent } from '../ai-agent/ai-intent-router';

const TELEGRAM_COMMANDS = [
  { command: 'help', description: 'Xem tất cả các lệnh của bot' },
  { command: 'status', description: 'Xem trạng thái liên kết và family đang dùng' },
  { command: 'families', description: 'Xem danh sách family có thể chọn' },
  { command: 'use_family', description: 'Chọn family: /use_family 1 hoặc /use_family <familyId>' },
  { command: 'gold', description: 'Xem giá vàng mới nhất' },
  { command: 'menu', description: 'Gợi ý thực đơn hôm nay' },
  { command: 'events', description: 'Xem lịch tháng này' },
  { command: 'events_next', description: 'Xem lịch tháng sau' },
  { command: 'wiki', description: 'Hỏi Family Wiki/RAG' },
  { command: 'horoscope', description: 'Xem tử vi/chiêm tinh' },
  { command: 'stats', description: 'Xem thống kê AI, chỉ dành cho admin' },
  { command: 'link_group', description: 'Liên kết group Telegram với family' },
];

@Injectable()
export class TelegramService implements OnModuleInit {
  private bot!: Telegraf;
  private readonly logger = new Logger(TelegramService.name);
  private handlersReady = false;

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    @Inject(forwardRef(() => AiAgentService))
    private aiAgentService: AiAgentService,
  ) {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (token) {
      this.bot = new Telegraf(token);
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
          this.bot.telegram.setWebhook(webhookUrl, webhookSecret ? { secret_token: webhookSecret } : undefined)
            .catch(err => this.logger.warn(`setWebhook failed (expected on serverless): ${err.message}`));
          this.logger.log(`Telegram bot webhook configured: ${webhookUrl}`);
          return;
        }

        if (!isProduction || usePolling) {
          this.bot.launch().catch(err => {
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

  private setupHandlers() {
    if (!this.bot) return;
    if (this.handlersReady) return;
    this.handlersReady = true;
    // 1. /start handler - linking user
    this.bot.start(async (ctx) => {
      const startPayload = (ctx as any).startPayload;
      const chatId = ctx.chat.id.toString();
      const username = ctx.from.username;
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

      if (isGroup) {
        await ctx.reply('👋 Chào cả nhà! Để nhận thông báo cho gia đình trong group này, hãy gõ lệnh: `/link_group [FamilyID]`');
        return;
      }

      if (startPayload) {
        try {
          const user = await this.prisma.user.update({
            where: { id: startPayload },
            data: { telegramChatId: chatId, telegramUsername: username },
          });
          await ctx.reply(buildWelcomeMessage(user.name));
        } catch (error) {
          await ctx.reply('❌ Có lỗi xảy ra khi kết nối. Hãy thử lại từ web app.');
        }
      } else {
        await ctx.reply(buildHelpMessage('Chào mừng bạn đến với FamilyGPT Telegram. Hãy mở Settings trong web app để liên kết tài khoản trước.'));
      }
    });

    // 2. /link_group handler
    this.bot.command('link_group', async (ctx) => {
      const args = ctx.message.text.split(' ');
      if (args.length < 2) return ctx.reply('Vui lòng gõ: `/link_group [ID_GIA_DINH]`');
      
      const familyId = args[1];
      const chatId = ctx.chat.id.toString();

      try {
        await this.prisma.family.update({
          where: { id: familyId },
          data: { telegramGroupId: chatId },
        });
        await ctx.reply('✅ Đã kết nối Group này với Gia đình thành công! Mình sẽ gửi các thông báo chung vào đây.');
      } catch (err) {
        await ctx.reply('❌ Không tìm thấy Gia đình với ID này.');
      }
    });

    this.bot.command('families', async (ctx) => {
      const user = await this.getLinkedUser(ctx.chat.id.toString());
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
    });

    this.bot.command('use_family', async (ctx) => {
      const user = await this.getLinkedUser(ctx.chat.id.toString());
      if (!user) {
        await ctx.reply('Bạn chưa kết nối tài khoản. Hay mở Telegram từ Settings trong web app trước.');
        return;
      }

      const rawValue = ctx.message.text.split(' ').slice(1).join(' ').trim();
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
    });

    this.bot.command('status', async (ctx) => {
      const user = await this.getLinkedUser(ctx.chat.id.toString());
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
    });

    this.bot.command('help', async (ctx) => {
      const user = await this.getLinkedUser(ctx.chat.id.toString());
      const title = user
        ? `Xin chào ${user.name}. Bạn có thể điều khiển FamilyGPT bằng các lệnh sau:`
        : 'Bạn có thể điều khiển FamilyGPT bằng các lệnh sau:';
      await ctx.reply(buildHelpMessage(title));
    });

    this.bot.command('gold', async (ctx) => {
      const user = await this.getLinkedUser(ctx.chat.id.toString());
      const familyId = getActiveFamily(user)?.id || user?.familyId || 'all';

      try {
        await ctx.sendChatAction('typing');
        const response = await this.aiAgentService.chat(
          familyId,
          'gia vang hom nay',
          user?.id ? [user.id] : undefined,
          undefined,
          'groq',
        );
        await ctx.reply(response.content);
      } catch (error) {
        this.logger.error('Telegram gold command error', error);
        await ctx.reply('Không lấy được giá vàng lúc này. Hãy thử lại sau.');
      }
    });

    this.bot.command('menu', async (ctx) => {
      await this.replyWithAiCommand(
        ctx,
        'hom nay an gi',
        'Không gợi ý được thực đơn lúc này. Hãy thử lại sau.',
      );
    });

    this.bot.command('events', async (ctx) => {
      const request = ((ctx.message as any)?.text || '').split(' ').slice(1).join(' ').trim();
      await this.replyWithAiCommand(
        ctx,
        request ? `lich ${request}` : 'lich thang nay',
        'Không xem được lịch lúc này. Hãy thử lại sau.',
      );
    });

    this.bot.command('events_next', async (ctx) => {
      await this.replyWithAiCommand(
        ctx,
        'lich thang sau',
        'Không xem được lịch tháng sau lúc này. Hãy thử lại sau.',
      );
    });

    this.bot.command('wiki', async (ctx) => {
      const question = ((ctx.message as any)?.text || '').split(' ').slice(1).join(' ').trim();
      if (!question) {
        await ctx.reply('Hãy gõ: /wiki <cau hoi>. Vi du: /wiki Nguyên có đẹp trai không ?');
        return;
      }

      await this.replyWithAiCommand(
        ctx,
        `Thông tin gia đình: ${question}`,
        'Không tra cứu được Family Wiki lúc này. Hãy thử lại sau.',
      );
    });

    this.bot.command('horoscope', async (ctx) => {
      const question = ((ctx.message as any)?.text || '').split(' ').slice(1).join(' ').trim();
      await this.replyWithAiCommand(
        ctx,
        question ? `tử vi cá nhân của tôi: ${question}` : 'tử vi cá nhân của tôi tuần này',
        'Không xem được tử vi lúc này. Hay thử lại sau.',
      );
    });

    // 3. /stats command for Admins
    this.bot.command('stats', async (ctx) => {
      const chatId = ctx.chat.id.toString();
      const user = await this.prisma.user.findUnique({ where: { telegramChatId: chatId } });
      
      if (user?.globalRole !== 'SUPER_ADMIN') {
        return ctx.reply('🚫 Bạn không có quyền truy cập lệnh này.');
      }

      const stats = this.aiAgentService.getSystemStats();
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
    });

    // 4. Handle generic text - AI Chat
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      const isGroup = ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';

      if (isGroup) {
        const route = classifyAiIntent(text);
        if (route.intent !== 'event_mutation') return;

        await this.replyWithAiCommand(
          ctx,
          `Yêu cầu lịch trong group family. Nếu tạo sự kiện, dùng scope FAMILY trừ khi người dùng nói rõ là riêng tư. Nội dung: ${text}`,
          'Không xử lý được yêu cầu lịch lúc này. Hãy thử lại sau.',
          true,
          { requireFamily: true },
        );
        return;
      }

      await this.replyWithAiCommand(
        ctx,
        text,
        '😅 Xin lỗi, trợ lý AI đang bận một chút, hãy thử lại sau nhé!',
      );
    });
  }

  async handleWebhookUpdate(update: any) {
    if (!this.bot) return;
    this.setupHandlers();
    await this.bot.handleUpdate(update);
  }

  private getLinkedUser(chatId: string) {
    return this.prisma.user.findUnique({
      where: { telegramChatId: chatId },
      include: { families: true, family: true },
    });
  }

  private getLinkedGroupFamily(chatId: string) {
    return this.prisma.family.findFirst({
      where: { telegramGroupId: chatId },
      select: { id: true, name: true },
    });
  }

  private async replyWithAiCommand(
    ctx: Context,
    prompt: string,
    fallbackMessage: string,
    requireLinked = true,
    options: { requireFamily?: boolean } = {},
  ) {
    const chatId = ctx.chat?.id?.toString();
    if (!chatId) return;

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
      return;
    }

    if (options.requireFamily && isGroup && !groupFamily) {
      await ctx.reply('Group này chưa liên kết với family. Hãy dùng /link_group <familyId> trước.');
      return;
    }

    const familyId = groupFamily?.id || getActiveFamily(user)?.id || user?.familyId || 'all';

    try {
      await ctx.sendChatAction('typing');
      const response = await this.aiAgentService.chat(
        familyId,
        prompt,
        user?.id ? [user.id] : undefined,
        undefined,
        'groq',
      );
      await ctx.reply(response.content);
    } catch (error) {
      this.logger.error(`Telegram AI command error: ${prompt}`, error);
      await ctx.reply(fallbackMessage);
    }
  }

  // Helper methodologies for notification module
  async sendMessageToUser(userId: string, message: string) {
    if (!this.bot) return;
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
  }

  async sendMessageToFamily(familyId: string, message: string) {
    if (!this.bot) return;
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
  }
}

function toObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getTelegramActiveFamilyId(settings: any): string | undefined {
  return toObject(toObject(settings).telegram).activeFamilyId;
}

function getUserFamilies(user: any) {
  if (!user) return [];
  const families = [...(user.families || [])];
  if (user.family && !families.some((family) => family.id === user.family.id)) {
    families.unshift(user.family);
  }
  return families;
}

function resolveFamilySelection(families: any[], value: string) {
  const index = Number.parseInt(value, 10);
  if (Number.isInteger(index) && index >= 1 && index <= families.length) {
    return families[index - 1];
  }

  return families.find((family) => family.id === value || family.name.toLowerCase() === value.toLowerCase());
}

function getActiveFamily(user: any) {
  if (!user) return undefined;
  const families = getUserFamilies(user);
  const activeFamilyId = getTelegramActiveFamilyId(user.notificationSettings);
  return families.find((family) => family.id === activeFamilyId) || user.family || families[0];
}

function buildWelcomeMessage(userName: string) {
  return buildHelpMessage([
    `Chào mừng ${userName}!`,
    'Bạn đã kết nối thành công tài khoản Family App với Telegram.',
    'Từ bây giờ bot có thể gửi thông báo và hỗ trợ trả lời theo family bạn chọn.',
  ].join('\n'));
}

function buildHelpMessage(title: string) {
  return [
    title,
    '',
    'You can control me by sending these commands:',
    '',
    'Family App',
    '/help - xem tất cả các lệnh của bot',
    '/status - xem tài khoản đã link với family đang dùng',
    '/families - xem các family có thể chọn',
    '/use_family <số|familyId> - chọn family cho các câu hỏi tiếp theo',
    '/gold - lấy giá vàng mới nhất',
    '',
    '/menu - gợi ý thực đơn hôm nay',
    '/events [tháng] - xem lịch, ví dụ /events, /events thang sau, /events thang 7',
    '/events_next - xem lịch tháng sau',
    '/wiki <câu hỏi> - hỏi Family Wiki/RAG',
    '/horoscope [câu hỏi] - xem tử vi/chiêm tinh theo family đang chọn',
    '',
    'AI',
    'Gửi tin nhắn bất kỳ - hỏi FamilyGPT theo family đang chọn. Trong group, nói tự nhiên để tạo/sửa/xóa lịch family nếu group đã link.',
    '',
    'Notifications',
    '/link_group <familyId> - liên kết group Telegram với family để nhận thông báo chung',
    '',
    'Admin',
    '/stats - xem uptime, cache, latency và lỗi của hệ thống AI',
  ].join('\n');
}
