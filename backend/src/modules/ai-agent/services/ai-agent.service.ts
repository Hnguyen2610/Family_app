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
  private readonly genericFamilyNames = new Set([
    'gia dinh',
    'family',
    'default family',
    'tat ca gia dinh',
    'all families',
  ]);
  private readonly genericFamilyWords = new Set([
    'gia',
    'dinh',
    'family',
    'families',
    'nha',
    'home',
    'default',
    'tat',
    'ca',
    'all',
  ]);

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

  private getFamilyMatchTerms(familyName: string) {
    const normalized = normalizeSearchText(familyName || '').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const meaningfulWords = words.filter((word) => word.length > 2 && !this.genericFamilyWords.has(word));

    return {
      normalized,
      meaningfulWords,
      isGeneric: !normalized || this.genericFamilyNames.has(normalized) || meaningfulWords.length === 0,
    };
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
    const isFamilyAware = ['general_chat', 'calendar_query', 'event_mutation', 'meal_suggestion', 'horoscope', 'family_knowledge', 'football', 'web_search'].includes(intent);

    // When familyId is 'all', fetch all user's families to determine if clarification is needed
    const userFamiliesPromise = familyId === 'all'
      ? this.prisma.user.findUnique({
          where: { id: userId },
          select: {
            familyId: true,
            family: { select: { id: true, name: true } },
            families: { select: { id: true, name: true } },
          },
        }).then(u => {
          const all: { id: string; name: string }[] = [];
          if (u?.family) all.push(u.family);
          for (const f of (u?.families || [])) {
            if (!all.some(x => x.id === f.id)) all.push(f);
          }
          return all;
        })
      : Promise.resolve<{ id: string; name: string }[]>([]);

    const userFamilies = await userFamiliesPromise;

    // Smart resolve: try to match family name from current message + recent history
    let resolvedFamilyId: string | undefined;
    if (familyId !== 'all') {
      resolvedFamilyId = familyId;
    } else if (userFamilies.length === 1) {
      resolvedFamilyId = userFamilies[0].id;
    } else if (userFamilies.length > 1) {
      // Try to detect which family the user mentioned in their message or recent history
      const historyMessages = await this.chatService.getHistory(familyId, sessionId, 6);
      const searchText = normalizeSearchText([
        userMessage,
        ...historyMessages.map((m: any) => m.content || ''),
      ].join(' '));

      const matchCandidates = userFamilies
        .map((family) => ({
          family,
          ...this.getFamilyMatchTerms(family.name),
        }))
        .filter((candidate) => !candidate.isGeneric)
        .sort((a, b) => b.normalized.length - a.normalized.length);

      for (const { family: f, normalized, meaningfulWords } of matchCandidates) {
        // Match exact specific family name first, then meaningful words.
        if (normalized.length >= 4 && searchText.includes(normalized)) {
          resolvedFamilyId = f.id;
          this.logger.debug(`[FamilyResolve] Matched specific family "${f.name}" from message text`);
          break;
        }
        if (meaningfulWords.length > 0 && meaningfulWords.every((word) => searchText.includes(word))) {
          resolvedFamilyId = f.id;
          this.logger.debug(`[FamilyResolve] Matched specific family "${f.name}" from word matching`);
          break;
        }
      }
    }

    const ragFamilyId = resolvedFamilyId || familyId;

    const [memoryContext, familyRaw, history] = await Promise.all([
      this.getMemoryContext(userId),
      isFamilyAware ? this.getFamilyContext(userId) : Promise.resolve(''),
      this.chatService.getHistory(familyId, sessionId, this.historyLimit),
    ]);
    const ragQuery = this.buildRagQuery(userMessage, history, Boolean(resolvedFamilyId));
    const shouldRetrieveRag = this.shouldRetrieveRag(intent, ragQuery);
    const ragResults = shouldRetrieveRag
      ? await this.ragService.searchFamilyKnowledge(ragFamilyId, ragQuery, 3)
      : [];

    // Only show disambiguation if we couldn't auto-resolve family from message
    const disambiguationNotice = (familyId === 'all' && userFamilies.length > 1 && !resolvedFamilyId)
      ? `USER IS VIEWING ALL FAMILIES. Their families:\n${userFamilies.map((f, i) => `${i + 1}. ${f.name} (id: ${f.id})`).join('\n')}\nINSTRUCTION: Ask the user ONCE which family to use. When they answer with a family name, call the tool immediately with that family's id — do NOT ask again.`
      : resolvedFamilyId
        ? `RESOLVED FAMILY: Using "${userFamilies.find(f => f.id === resolvedFamilyId)?.name || resolvedFamilyId}" (id: ${resolvedFamilyId}) for all write operations.`
        : '';

    const ragContext = this.ragService.formatRagContext(ragResults);
    const ragFamilyContext = ragContext ? `FAMILY WIKI RETRIEVED CONTEXT:\n${ragContext}` : '';
    const familyContext = [memoryContext, familyRaw, disambiguationNotice, ragFamilyContext].filter(Boolean).join('\n\n');

    return {
      userId,
      familyId,
      resolvedFamilyId,
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

  private buildRagQuery(userMessage: string, history: any[], hasResolvedFamily: boolean) {
    const normalized = normalizeSearchText(userMessage || '').trim();
    const words = normalized.split(/\s+/).filter(Boolean);
    const isLikelyFamilySelection = hasResolvedFamily && words.length > 0 && words.length <= 4 && !/[?？]/.test(userMessage);
    if (!isLikelyFamilySelection) return userMessage;

    const previousUserQuestion = (history || [])
      .filter((message: any) => message?.role === 'user')
      .map((message: any) => String(message.content || '').trim())
      .find((content: string) => content && normalizeSearchText(content) !== normalized);

    return previousUserQuestion ? `${previousUserQuestion}\n${userMessage}` : userMessage;
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
      'luu ',
      'nho ',
      'long memory',
      'ky niem',
      'save ',
      'remember',
    ];
    const familyFactQuestionSignals = [
      'bao nhieu',
      'la gi',
      'la ngay nao',
      'ngay nao',
      'ngay dau tien',
      'dau tien',
      'yeu nhau',
      'thich gi',
      'so thich',
      'khong thich',
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
    if (familyFactQuestionSignals.some((signal) => normalized.includes(signal))) return true;
    if (['meal_suggestion', 'calendar_query', 'event_mutation', 'horoscope'].includes(intent)) {
      return suggestionSignals.some((signal) => normalized.includes(signal));
    }

    return false;
  }

  private shouldAllowKnowledgeWriteTool(context: AiSkillContext) {
    const normalized = normalizeSearchText(context.userMessage || '');
    return /\b(luu|nho|ghi nho|long memory|so tay|rag|save|remember)\b/.test(normalized);
  }

  private shouldAllowGeneralMemoryTools(context: AiSkillContext) {
    const normalized = normalizeSearchText(context.userMessage || '');
    return /\b(luu|nho|ghi nho|so tay|long memory|rag|save|remember|toi thich|minh thich|khong thich|di ung|so thich|ghi chu)\b/.test(normalized);
  }

  private getSkillToolsForContext(skill: any, context: AiSkillContext) {
    if (!skill.getTools) return [];
    if (skill.name === 'FamilyKnowledgeSkill' && !this.shouldAllowKnowledgeWriteTool(context)) return [];
    if (skill.name === 'GeneralChatSkill' && !this.shouldAllowGeneralMemoryTools(context)) return [];
    return skill.getTools();
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
    const knowledgeSkill = this.skillRegistry.getAllSkills().find(s => s.name === 'FamilyKnowledgeSkill');

    const directStructuredAction = await this.tryHandleStructuredMemoryEvent(skill, knowledgeSkill, skillContext);
    if (directStructuredAction) {
      await this.chatService.saveMessage(familyId, 'assistant', directStructuredAction, sessionId);
      return { content: directStructuredAction, familyId, cached: false, direct: true };
    }

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
      // Intentionally skip — unified dispatcher below handles this
    }

    // Redact PII before sending to external AI provider
    const { redacted: safeMessage, hits } = redactSensitiveData(userMessage, intentRoute.intent);
    if (hits.length > 0) this.logger.warn(`[chat] Redacted PII in message: ${hits.join(', ')}`);

    const allowKnowledgeWrite = this.shouldAllowKnowledgeWriteTool(skillContext);
    const skillTools = this.getSkillToolsForContext(skill, skillContext);
    const knowledgeTools = knowledgeSkill?.getTools && allowKnowledgeWrite ? knowledgeSkill.getTools() : [];
    const combinedTools = [...skillTools];
    for (const kt of knowledgeTools) {
      if (!combinedTools.some(st => st.function.name === kt.function.name)) {
        combinedTools.push(kt);
      }
    }

    // Unified tool dispatcher
    const baseExecuteToolChat = deps.executeTool;
    deps.executeTool = async (name: string, args: any, fid: string, uid: string) => {
      this.logger.debug(`[ToolDispatch/chat] Executing tool: ${name}`);
      if (name === 'createWikiEntry' && !this.shouldAllowKnowledgeWriteTool(skillContext)) {
        return toolError(name, 'Knowledge write is disabled because the user is asking a question, not asking to save memory.');
      }
      if (skill.executeTool) {
        const r = await skill.executeTool(name, args, skillContext);
        if (r !== undefined) {
          this.logger.debug(`[ToolDispatch/chat] ${name} handled by ${skill.name}`);
          return r;
        }
      }
      if (knowledgeSkill?.executeTool) {
        const r = await knowledgeSkill.executeTool(name, args, skillContext);
        if (r !== undefined) {
          this.logger.debug(`[ToolDispatch/chat] ${name} handled by FamilyKnowledgeSkill`);
          return r;
        }
      }
      this.logger.warn(`[ToolDispatch/chat] No skill handled tool: ${name}, using baseExecuteTool`);
      return baseExecuteToolChat(name, args, fid, uid);
    };

    const chatInput = {
      familyId, history: skillContext.history || [], familyInfo: skillContext.familyContext || '',
      finalUserMessage: safeMessage, userId: targetUserId, intentRoute, sessionId, trace,
      image,
      systemPromptOverride: this.composePrompt(skillContext, skill.getSystemPrompt(skillContext)),
      toolsOverride: combinedTools.length > 0 ? combinedTools : undefined,
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
    // Handle pseudo-function calls (hallucinations or text-based tools)
    if (result.content && result.content.includes('<function:')) {
      await this.interceptAndExecuteMutations(result.content, familyId, targetUserId, skill, skillContext);
      result = {
        ...result,
        content: this.stripPseudoFunctionTags(result.content),
      };
    }

    if (cacheKey) setCachedResponse(cacheKey, result, getSkillTtl(intentRoute.intent));

    return { ...result, cached: false };
  }

  private stripPseudoFunctionTags(content: string) {
    const stripped = content
      .replace(/<function:\w+\b[^>]*>[\s\S]*?<\/function>/g, '')
      .replace(/<function:\w+\b[^>]*\/?>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return stripped || 'Mình đã ghi nhận yêu cầu, nhưng cần bạn xác nhận trong app trước khi lưu thông tin này.';
  }

  /**
   * Parse <function:name arg="val"> tags and execute them via the skill.
   */
  private async interceptAndExecuteMutations(content: string, familyId: string, userId: string, skill: any, context: any) {
    const pattern = /<function:(\w+)\s+([^>]+)>/g;
    let match;

    while ((match = pattern.exec(content)) !== null) {
      const toolName = match[1];
      const paramsStr = match[2];
      const args: any = {};
      
      const argPattern = /(\w+)="?([^"\s>]+)"?/g;
      let argMatch;
      while ((argMatch = argPattern.exec(paramsStr)) !== null) {
        args[argMatch[1]] = argMatch[2];
      }

      try {
        this.logger.log(`[Mutation Interceptor] Executing: ${toolName} for userId ${userId}`);
        // Ensure familyId is provided if missing in args
        if (!args.familyId) args.familyId = familyId;
        await skill.executeTool(toolName, args, context);
      } catch (err) {
        this.logger.error(`[Mutation Interceptor] Failed to execute ${toolName}`, err);
      }
    }
  }

  // ─── Stream ────────────────────────────────────────────────────────────────

  private extractExplicitTitleFromMessage(userMessage: string) {
    const marker = userMessage.match(/(?:v[oớ]i\s+title|title|ti[eê]u\s*[dđ][eề])\s*[:：]?\s*/i);
    if (!marker || marker.index === undefined) return '';

    const start = marker.index + marker[0].length;
    const rest = userMessage.slice(start);
    const stop = rest.search(/(?:\.\s*)?(?:sau\s*[dđ][oó]|r[oồ]i|v[aà]\s+sau\s*[dđ][oó]|sau\s+[dđ][oó]\s+gi[uú]p)/i);

    return (stop >= 0 ? rest.slice(0, stop) : rest)
      .replace(/^[\s"']+|[\s"'.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getFullDateFromMessage(userMessage: string) {
    const match = userMessage.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!match) return undefined;

    return {
      display: `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`,
      iso: `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`,
    };
  }

  private buildEventTitleFromMemoryTitle(memoryTitle: string) {
    return memoryTitle
      .replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*(?:l[aà]\s*)?/i, '')
      .trim() || memoryTitle || 'Kỷ niệm gia đình';
  }

  private async tryHandleStructuredMemoryEvent(skill: any, knowledgeSkill: any, context: AiSkillContext) {
    const message = context.userMessage || '';
    const normalized = normalizeSearchText(message);
    const date = this.getFullDateFromMessage(message);
    const wantsMemory = /\b(luu|nho|long memory|bo nho|so tay|rag)\b/.test(normalized);
    const wantsEvent = /\b(tao su kien|them su kien|lich|calendar|anniversary|ky niem)\b/.test(normalized);
    const wantsYearly = /\b(hang nam|moi nam|yearly|anniversary)\b/.test(normalized);

    if (!date || !wantsMemory || !wantsEvent || !wantsYearly || !context.resolvedFamilyId) {
      return undefined;
    }

    const calendarSkill = skill?.name === 'CalendarSkill'
      ? skill
      : this.skillRegistry.getAllSkills().find((candidate) => candidate.name === 'CalendarSkill');
    if (!calendarSkill?.executeTool || !knowledgeSkill?.executeTool) return undefined;

    const memoryTitle = this.extractExplicitTitleFromMessage(message) || `${date.display} là kỷ niệm gia đình`;
    const eventTitle = this.buildEventTitleFromMemoryTitle(memoryTitle);

    const memoryResult = await knowledgeSkill.executeTool('createWikiEntry', {
      title: memoryTitle,
      content: memoryTitle,
      familyId: context.resolvedFamilyId,
    }, context);

    const eventResult = await calendarSkill.executeTool('createEvent', {
      title: eventTitle,
      description: memoryTitle,
      date: date.iso,
      scope: 'FAMILY',
      type: 'ANNIVERSARY',
      isRecurring: true,
      recurring: 'YEARLY',
      familyId: context.resolvedFamilyId,
    }, context);

    this.logger.debug(`[DirectStructuredAction] memory=${JSON.stringify(memoryResult)} event=${JSON.stringify(eventResult)}`);
    return `Đã lưu vào sổ tay gia đình: ${memoryTitle}\nĐã tạo sự kiện kỷ niệm hằng năm: ${eventTitle} (${date.display}).`;
  }

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
    const knowledgeSkill = this.skillRegistry.getAllSkills().find(s => s.name === 'FamilyKnowledgeSkill');

    const directStructuredAction = await this.tryHandleStructuredMemoryEvent(skill, knowledgeSkill, skillContext);
    if (directStructuredAction) {
      await this.chatService.saveMessage(familyId, 'assistant', directStructuredAction, sessionId);
      res.write(`data: ${JSON.stringify({ content: directStructuredAction })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      appendRequestLog({ type: 'stream', intent: intentRoute.intent, model: 'direct', latencyMs: 0, cached: false, redacted: false });
      return;
    }

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
    // Redact PII before sending to external AI provider
    const { redacted: safeStreamMessage, hits: streamHits } = redactSensitiveData(userMessage, intentRoute.intent);
    if (streamHits.length > 0) this.logger.warn(`[stream] Redacted PII in message: ${streamHits.join(', ')}`);

    const allowKnowledgeWrite = this.shouldAllowKnowledgeWriteTool(skillContext);
    const skillTools = this.getSkillToolsForContext(skill, skillContext);
    const knowledgeTools = knowledgeSkill?.getTools && allowKnowledgeWrite ? knowledgeSkill.getTools() : [];
    const combinedTools = [...skillTools];
    for (const kt of knowledgeTools) {
      if (!combinedTools.some(st => st.function.name === kt.function.name)) {
        combinedTools.push(kt);
      }
    }

    // Build unified tool dispatcher - try CalendarSkill first, then FamilyKnowledgeSkill, then fallback
    const baseExecuteTool = deps.executeTool;
    deps.executeTool = async (name: string, args: any, fid: string, uid: string) => {
      this.logger.debug(`[ToolDispatch] Executing tool: ${name}`);
      if (name === 'createWikiEntry' && !this.shouldAllowKnowledgeWriteTool(skillContext)) {
        return toolError(name, 'Knowledge write is disabled because the user is asking a question, not asking to save memory.');
      }
      if (skill.executeTool) {
        const r = await skill.executeTool(name, args, skillContext);
        if (r !== undefined) {
          this.logger.debug(`[ToolDispatch] ${name} handled by ${skill.name}`);
          return r;
        }
      }
      if (knowledgeSkill?.executeTool) {
        const r = await knowledgeSkill.executeTool(name, args, skillContext);
        if (r !== undefined) {
          this.logger.debug(`[ToolDispatch] ${name} handled by FamilyKnowledgeSkill`);
          return r;
        }
      }
      this.logger.warn(`[ToolDispatch] No skill handled tool: ${name}, using baseExecuteTool`);
      return baseExecuteTool(name, args, fid, uid);
    };

    const streamInput = {
      familyId, history: skillContext.history || [], familyInfo: skillContext.familyContext || '',
      finalUserMessage: safeStreamMessage, userId: targetUserId, intentRoute, sessionId, trace, res,
      image,
      systemPromptOverride: this.composePrompt(skillContext, skill.getSystemPrompt(skillContext)),
      toolsOverride: combinedTools.length > 0 ? combinedTools : undefined,
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
      const errorMessage = streamError || 'Unknown error';
      const fallbackMessage = /failed to call a function/i.test(errorMessage)
        ? 'AI đang gặp chút khó khăn khi xử lý yêu cầu phức tạp này. Bạn thử đặt câu hỏi đơn giản hơn hoặc gửi lại sau vài giây nhé.'
        : 'Kết nối AI đang gặp lỗi tạm thời (Timeout hoặc Quá tải). Bạn thử lại sau ít phút nhé.';
      this.logger.error(`[chatStream] ${errorMessage}`);
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ content: fallbackMessage })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'error', error: errorMessage })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      await this.chatService.saveMessage(familyId, 'assistant', fallbackMessage, sessionId);
      return;
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
