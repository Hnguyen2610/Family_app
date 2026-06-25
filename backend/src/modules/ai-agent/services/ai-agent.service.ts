import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './chat.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { HoroscopeService } from './horoscope.service';
import { classifyAiIntent, normalizeSearchText } from '../ai-intent-router';
import { createAiTrace } from '../ai-observability';
import {
  handleGeminiChat,
  handleGeminiStream,
  handleGroqChat,
  handleGroqStream,
} from '../ai-model-handlers';
import {
  buildResponseCacheKey,
  getCachedResponse,
  getCacheStats,
  getSkillTtl,
  isResponseCacheable,
  setCachedResponse,
} from '../ai-response-cache';
import { routeAiModel } from '../ai-model-routing';
import { buildMemoryProfileContext, parseMemoryProfile } from '../ai-memory-profile';
import { toolError } from '../ai-tool-results';
import { AiSkillRegistry } from '../skills/ai-skill-registry';
import { AiSkillContext } from '../interfaces/ai-skill.interface';
import { buildSystemPrompt } from '../ai-agent-prompt';
import { RagService } from './rag.service';
import { redactSensitiveData } from '../ai-redact';
import { appendRequestLog } from '../ai-request-log';

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly openai: OpenAI;
  private readonly gemini: GoogleGenerativeAI;
  private readonly groqModel = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
  private readonly geminiModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
  private readonly aiMaxTokens = Number.parseInt(process.env.AI_MAX_TOKENS || '800', 10);
  private readonly historyLimit = Number.parseInt(process.env.AI_HISTORY_LIMIT || '6', 10);
  private readonly groqContextWindow = Number.parseInt(process.env.GROQ_CONTEXT_WINDOW || '131072', 10);
  private readonly geminiContextWindow = Number.parseInt(process.env.GEMINI_CONTEXT_WINDOW || '1048576', 10);

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly skillRegistry: AiSkillRegistry,
    private readonly horoscopeService: HoroscopeService,
    private readonly ragService: RagService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
  }

  // ─── Context Helpers ───────────────────────────────────────────────────────

  private async getFamilyContext(userId: string): Promise<string> {
    if (!userId) return '';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        role: true,
        birthday: true,
        email: true,
        family: {
          include: {
            users: { select: { id: true, name: true, role: true, birthday: true, email: true } },
          },
        },
        families: {
          include: {
            users: { select: { id: true, name: true, role: true, birthday: true, email: true } },
          },
        },
      },
    });
    if (!user) return '';

    const families = [...(user.families || [])];
    if (user.family && !families.some((family) => family.id === user.family?.id)) {
      families.unshift(user.family);
    }

    let ctx = '';
    ctx += `CURRENT LINKED USER: ${user.name} (${user.role || 'Thành viên'}, SN: ${user.birthday?.toISOString().split('T')[0] ?? 'Chưa rõ'})\n`;

    for (const family of families) {
      ctx += `\nGIA ĐÌNH: ${family.name}\n`;
      ctx += family.users.map(u => `- ${u.name} (${u.role || 'Thành viên'}, SN: ${u.birthday?.toISOString().split('T')[0] ?? 'Chưa rõ'})`).join('\n');
      ctx += '\n';
    }
    return ctx;
  }

  private async getMemoryContext(userId: string): Promise<string> {
    if (!userId) return '';
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        notificationSettings: true,
        mealPreferences: {
          include: { meal: true }
        }
      }
    });

    const profile = parseMemoryProfile(user?.notificationSettings);

    // Merge meal preferences into foodLikes if they aren't already there
    const mealLikes = user?.mealPreferences.map(p => p.meal.name) || [];
    const combinedLikes = Array.from(new Set([...(profile.foodLikes || []), ...mealLikes]));

    return buildMemoryProfileContext({
      ...profile,
      foodLikes: combinedLikes
    });
  }


  /**
   * Build skill context. Only fetches memory once, composes familyContext.
   */
  private async getAiSkillContext(
    familyId: string,
    userMessage: string,
    userId: string,
    intent: string,
    image?: string,
    trace?: any,
    sessionId?: string,
  ): Promise<AiSkillContext> {
    const isFamilyAware = ['general_chat', 'calendar_query', 'event_mutation', 'meal_suggestion', 'horoscope', 'family_knowledge'].includes(intent);
    const shouldRetrieveRag = this.shouldRetrieveRag(intent, userMessage);

    const [memoryContext, familyRaw, history, ragResults] = await Promise.all([
      this.getMemoryContext(userId),
      isFamilyAware ? this.getFamilyContext(userId) : Promise.resolve(''),
      this.chatService.getHistory(familyId, sessionId, this.historyLimit),
      shouldRetrieveRag ? this.ragService.searchFamilyKnowledge(familyId, userMessage, 3) : Promise.resolve([]),
    ]);

    const ragContext = this.ragService.formatRagContext(ragResults);
    const ragFamilyContext = ragContext ? `FAMILY WIKI RETRIEVED CONTEXT:\n${ragContext}` : '';
    const familyContext = [memoryContext, familyRaw, ragFamilyContext].filter(Boolean).join('\n\n');
    return {
      userId,
      familyId,
      userMessage,
      intent,
      image,
      familyContext,
      memoryContext,
      ragContext,
      ragSources: ragResults.map((result) => ({
        documentId: result.documentId,
        title: result.title,
        chunkIndex: result.chunkIndex,
        score: result.score,
      })),
      history,
      trace,
    };
  }

  private shouldRetrieveRag(intent: string, userMessage: string) {
    if (intent === 'family_knowledge') return true;
    if (intent === 'image_vision' || intent === 'gold_price') return false;

    const normalized = normalizeSearchText(userMessage);

    const familySignals = [
      'nha minh',
      'gia dinh minh',
      'so tay',
      'ghi chu',
      'family wiki',
      'wiki gia dinh',
      'thong tin gia dinh',
      'theo nha minh',
      'theo ghi chu',
    ];
    const suggestionSignals = [
      'goi y',
      'nen',
      'chuan bi',
      'ke hoach',
      'an gi',
      'thuc don',
      'qua tang',
      'sinh nhat',
      'lich hoc',
      'don thuoc',
    ];

    if (familySignals.some((signal) => normalized.includes(signal))) return true;
    if (['meal_suggestion', 'calendar_query', 'event_mutation', 'horoscope'].includes(intent)) {
      return suggestionSignals.some((signal) => normalized.includes(signal));
    }

    return false;
  }

  // ─── Model deps ────────────────────────────────────────────────────────────

  private buildExecuteTool() {
    return async (toolName: string, _args: any, _familyId: string, _userId: string): Promise<any> => {
      this.logger.warn(`Fallback executeTool called for: ${toolName}`);
      return toolError(toolName, 'Tool not handled by any skill.');
    };
  }

  private getModelHandlerDeps(modelOverride?: { groqModel?: string; geminiModel?: string }) {
    return {
      logger: this.logger, openai: this.openai, gemini: this.gemini, chatService: this.chatService,
      groqModel: modelOverride?.groqModel || this.groqModel,
      geminiModel: modelOverride?.geminiModel || this.geminiModel,
      aiMaxTokens: this.aiMaxTokens, groqContextWindow: this.groqContextWindow,
      geminiContextWindow: this.geminiContextWindow, historyLimit: this.historyLimit,
      executeTool: this.buildExecuteTool(),
    };
  }

  /**
   * Compose common system prompt with skill-specific additions.
   * The skill prompt is APPENDED, not replacing the base.
   */
  private composePrompt(skillContext: AiSkillContext, skillExtra: string): string {
    const base = buildSystemPrompt(skillContext.familyContext || '', skillContext.intent as any);
    return skillExtra ? `${base}\n\n${skillExtra}` : base;
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────

  async chat(familyId: string, userMessage: string, userIds: string[] = [], image?: string, modelSelection?: string, sessionId?: string) {
    const trace = createAiTrace('chat', modelSelection || 'groq');

    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);

    const targetUserId = userIds[0] || '';
    const intentRoute = classifyAiIntent(userMessage, !!image);
    const routedModel = routeAiModel(modelSelection, intentRoute);

    // Cache check
    const cacheKey = isResponseCacheable(userMessage, !!image, intentRoute)
      ? buildResponseCacheKey({ familyId, userId: targetUserId, model: routedModel.provider, userMessage, intent: intentRoute.intent })
      : undefined;
    const cached = cacheKey ? getCachedResponse(cacheKey) : undefined;
    if (cached) {
      await this.chatService.saveMessage(familyId, 'assistant', cached.content, sessionId);
      return { ...cached, cached: true };
    }

    const skill = this.skillRegistry.getSkillForIntent(intentRoute.intent as any);
    this.logger.debug(`Selected AI skill ${skill.name} for intent ${intentRoute.intent}`);
    const skillContext = await this.getAiSkillContext(familyId, userMessage, targetUserId, intentRoute.intent, image, trace, sessionId);

    // Direct answer
    if (skill.tryDirectAnswer) {
      const direct = await skill.tryDirectAnswer(skillContext);
      if (direct) {
        await this.chatService.saveMessage(familyId, 'assistant', direct.content, sessionId);
        if (cacheKey) setCachedResponse(cacheKey, { content: direct.content, familyId }, getSkillTtl(intentRoute.intent));
        return { content: direct.content, familyId, cached: false, direct: true };
      }
    }

    const deps = this.getModelHandlerDeps(
      routedModel.provider === 'groq'
        ? { groqModel: routedModel.model }
        : { geminiModel: routedModel.model }
    );
    if (skill.executeTool) {
      const original = deps.executeTool;
      deps.executeTool = async (name, args, fid, uid) => {
        const res = await skill.executeTool!(name, args, skillContext);
        return res !== undefined ? res : original(name, args, fid, uid);
      };
    }

    // Redact PII before sending to external AI provider
    const { redacted: safeMessage, hits } = redactSensitiveData(userMessage, intentRoute.intent);
    if (hits.length > 0) this.logger.warn(`[chat] Redacted PII in message: ${hits.join(', ')}`);

    const chatInput = {
      familyId, history: skillContext.history || [], familyInfo: skillContext.familyContext || '',
      finalUserMessage: safeMessage, userId: targetUserId, intentRoute, sessionId, trace,
      image,
      systemPromptOverride: this.composePrompt(skillContext, skill.getSystemPrompt(skillContext)),
      toolsOverride: skill.getTools?.(),
    };

    const t0 = Date.now();
    let aiError: string | undefined;
    let result: any;
    try {
      result = await (routedModel.provider === 'gemini' ? handleGeminiChat(deps, chatInput) : handleGroqChat(deps, chatInput));
    } catch (err: any) {
      aiError = err?.message || 'Unknown error';
      throw err;
    } finally {
      appendRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        model: routedModel.provider,
        latencyMs: Date.now() - t0,
        cached: false,
        redacted: hits.length > 0,
        error: aiError,
        tokenCount: result?.usage?.totalTokens,
      });
    }
    if (cacheKey) setCachedResponse(cacheKey, result, getSkillTtl(intentRoute.intent));
    return { ...result, cached: false };
  }

  // ─── Stream ────────────────────────────────────────────────────────────────

  async chatStream(familyId: string, userMessage: string, userIds: string[], res: any, sessionId?: string, image?: string, modelSelection?: string) {
    const trace = createAiTrace('stream', modelSelection || 'groq', res);


    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);

    const targetUserId = userIds[0] || '';
    const intentRoute = classifyAiIntent(userMessage, !!image);
    const routedModel = routeAiModel(modelSelection, intentRoute);

    // Cache check
    const cacheKey = isResponseCacheable(userMessage, !!image, intentRoute)
      ? buildResponseCacheKey({ familyId, userId: targetUserId, model: routedModel.provider, userMessage, intent: intentRoute.intent })
      : undefined;
    const cached = cacheKey ? getCachedResponse(cacheKey) : undefined;

    res.write(`data: ${JSON.stringify({ type: 'status', status: image ? 'uploading_image' : 'generating_answer' })}\n\n`);

    if (cached) {
      res.write(`data: ${JSON.stringify({ type: 'cached', cached: true })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: cached.content })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      appendRequestLog({ type: 'stream', intent: intentRoute.intent, model: routedModel.provider, latencyMs: 0, cached: true, redacted: false });
      return;
    }

    const skill = this.skillRegistry.getSkillForIntent(intentRoute.intent as any);
    this.logger.debug(`Selected AI stream skill ${skill.name} for intent ${intentRoute.intent}`);
    const skillContext = await this.getAiSkillContext(familyId, userMessage, targetUserId, intentRoute.intent, image, trace, sessionId);

    // Direct answer
    if (skill.tryDirectAnswer) {
      const direct = await skill.tryDirectAnswer(skillContext);
      if (direct) {
        await this.chatService.saveMessage(familyId, 'assistant', direct.content, sessionId);
        if (cacheKey) setCachedResponse(cacheKey, { content: direct.content, familyId }, getSkillTtl(intentRoute.intent));
        res.write(`data: ${JSON.stringify({ content: direct.content })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
    }

    const deps = this.getModelHandlerDeps(
      routedModel.provider === 'groq'
        ? { groqModel: routedModel.model }
        : { geminiModel: routedModel.model }
    );
    if (skill.executeTool) {
      const original = deps.executeTool;
      deps.executeTool = async (name, args, fid, uid) => {
        const r = await skill.executeTool!(name, args, skillContext);
        return r !== undefined ? r : original(name, args, fid, uid);
      };
    }

    // Redact PII before sending to external AI provider
    const { redacted: safeStreamMessage, hits: streamHits } = redactSensitiveData(userMessage, intentRoute.intent);
    if (streamHits.length > 0) this.logger.warn(`[stream] Redacted PII in message: ${streamHits.join(', ')}`);

    const streamInput = {
      familyId, history: skillContext.history || [], familyInfo: skillContext.familyContext || '',
      finalUserMessage: safeStreamMessage, userId: targetUserId, intentRoute, sessionId, trace, res,
      image,
      systemPromptOverride: this.composePrompt(skillContext, skill.getSystemPrompt(skillContext)),
      toolsOverride: skill.getTools?.(),
    };

    const t1 = Date.now();
    let streamError: string | undefined;
    try {
      if (routedModel.provider === 'gemini') {
        await handleGeminiStream(deps, streamInput);
      } else {
        await handleGroqStream(deps, streamInput);
      }
    } catch (err: any) {
      streamError = err?.message || 'Unknown error';
      throw err;
    } finally {
      appendRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        model: routedModel.provider,
        latencyMs: Date.now() - t1,
        cached: false,
        redacted: streamHits.length > 0,
        error: streamError,
      });
    }
  }

  // ─── Legacy proxies for other modules ──────────────────────────────────────

  async generateHoroscope(userName: string, birthday?: Date, context = ''): Promise<string> {
    return this.horoscopeService.generateWeeklyHoroscope(userName, birthday, context);
  }

  async categorizeTransaction(description: string): Promise<{ category: string; type: 'INCOME' | 'EXPENSE' }> {
    const prompt = `Phân loại giao dịch ngân hàng Việt Nam. Danh mục: FOOD, TRANSPORT, SHOPPING, UTILITIES, RENT, ENTERTAINMENT, HEALTH, EDUCATION, SALARY, BONUS, INVESTMENT, OTHER.
Nội dung: "${description}"
JSON duy nhất: {"category": "...", "type": "INCOME"|"EXPENSE"}`;
    try {
      const model = this.gemini.getGenerativeModel({ model: 'gemini-flash-latest' });
      const text = (await model.generateContent(prompt)).response.text();
      const parts = JSON.parse(text.match(/\{.*\}/s)?.[0] || '{}');
      return { category: (parts.category || 'OTHER').toUpperCase(), type: (parts.type || 'EXPENSE').toUpperCase() as any };
    } catch {
      return { category: 'OTHER', type: 'EXPENSE' };
    }
  }

  getSystemStats() {
    const { getRequestLogs, getLogStats } = require('../ai-request-log');
    return {
      cache: getCacheStats(),
      logStats: getLogStats(),
      recentLogs: getRequestLogs(20),
      models: {
        groq: this.groqModel,
        gemini: this.geminiModel,
        maxTokens: this.aiMaxTokens,
        historyLimit: this.historyLimit,
        groqContextWindow: this.groqContextWindow,
        geminiContextWindow: this.geminiContextWindow,
      },
      uptime: Math.floor(process.uptime()),
      memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      timestamp: new Date().toISOString(),
    };
  }
}
