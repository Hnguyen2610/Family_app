import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './chat.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { HoroscopeService } from './horoscope.service';
import { AiIntentRoute, classifyAiIntent, normalizeSearchText } from '../ai-intent-router';
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
import {
  addRequestFeedback,
  appendRequestLog,
  configureAiRequestLogPersistence,
  getFeedbackStats,
  getFilteredRequestLogs,
  getLogStats,
  getTopRetrievedRagSources,
  updateRequestLog,
  type AiFeedbackValue,
} from '../ai-request-log';
import { parseCalendarMutation, parseCalendarDate } from '../ai-calendar-mutation-parser';
import { AiIntentClassifier } from '../ai-intent-classifier';
import { appendConfusionCase } from '../ai-confusion-log';
import { createSkillToolDispatcher, mergeUniqueTools } from '../ai-tool-dispatcher';

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
  private readonly intentClassifier: AiIntentClassifier;

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly skillRegistry: AiSkillRegistry,
    private readonly horoscopeService: HoroscopeService,
    private readonly ragService: RagService,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.intentClassifier = new AiIntentClassifier(
      this.openai,
      process.env.AI_INTENT_CLASSIFIER_MODEL || 'llama-3.1-8b-instant',
    );
    configureAiRequestLogPersistence(this.prisma);
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

    if (ragResults.length > 0) {
      this.logger.debug(`[RAG Retrieval] Matched ${ragResults.length} snippets for query "${ragQuery}":\n` +
        ragResults.map((r, i) => `  [#${i + 1}] Title: "${r.title}", Chunk: ${r.chunkIndex}, Score: ${r.score.toFixed(3)}, Method: ${r.retrieval}\n      Snippet: ${r.content.substring(0, 150)}...`).join('\n')
      );
    } else if (shouldRetrieveRag) {
      this.logger.debug(`[RAG Retrieval] No snippets matched query "${ragQuery}" for family "${ragFamilyId}"`);
    }

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
      ragQuery: shouldRetrieveRag ? ragQuery : undefined,
      ragMiss: shouldRetrieveRag && ragResults.length === 0,
      ragSources: this.toRagLogSources(ragResults),
      history,
      trace,
    };
  }

  private toRagLogSources(results: Array<{
    documentId: string;
    title: string;
    chunkIndex: number;
    score: number;
    familyId?: string;
    sourceType?: string;
    category?: string;
    retrieval?: string;
    content?: string;
  }>) {
    return results.map((result) => ({
      documentId: result.documentId,
      title: result.title,
      chunkIndex: result.chunkIndex,
      score: Number(result.score || 0),
      familyId: result.familyId,
      sourceType: result.sourceType,
      category: result.category,
      retrieval: result.retrieval,
      snippet: String(result.content || '').slice(0, 500),
    }));
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
    if (intent === 'image_vision' || intent === 'gold_price' || intent === 'football' || intent === 'weather') return false;

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

    // Core family members combined with personal query check
    const familyPronouns = ['vo', 'chong', 'bo', 'me', 'con', 'anh', 'em', 'ong', 'ba', 'thanh vien', 'nha', 'gia dinh'];
    const hasFamilyPronoun = familyPronouns.some((p) => {
      const regex = new RegExp(`\\b${p}\\b`);
      return regex.test(normalized);
    });

    if (hasFamilyPronoun) return true;
    if (familySignals.some((signal) => normalized.includes(signal))) return true;

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
      'di ung',
      'ghet',
    ];
    if (familyFactQuestionSignals.some((signal) => normalized.includes(signal))) return true;

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

  private isSideEffectTool(toolName: string) {
    return ['createEvent', 'updateEvent', 'deleteEvent', 'createWikiEntry'].includes(toolName);
  }

  private shouldAllowSideEffectTool(toolName: string, context: AiSkillContext) {
    if (!this.isSideEffectTool(toolName)) return true;
    if (toolName === 'createWikiEntry') return this.shouldAllowKnowledgeWriteTool(context);

    const normalized = normalizeSearchText(context.userMessage || '');
    if (toolName === 'createEvent') return /\b(tao|them|len lich|dat lich|nhac|create|add|schedule)\b/.test(normalized);
    if (toolName === 'updateEvent') return /\b(sua|cap nhat|doi|update|edit)\b/.test(normalized);
    if (toolName === 'deleteEvent') return /\b(xoa|huy|delete|remove|cancel)\b/.test(normalized);
    return false;
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

  private async classifyIntentWithFallback(userMessage: string, hasImage: boolean): Promise<AiIntentRoute> {
    const ruleRoute = classifyAiIntent(userMessage, hasImage);
    if (!this.intentClassifier.shouldUseLlmFallback(ruleRoute, userMessage, hasImage)) {
      return ruleRoute;
    }
    return this.intentClassifier.classify(userMessage, ruleRoute);
  }

  /**
   * If after all classification, the intent is still very uncertain, return a special
   * clarification route so the chat layer can ask the user to rephrase.
   */
  private buildClarificationRoute(): AiIntentRoute {
    return {
      intent: 'general_chat',
      requiresTools: false,
      confidence: 0.3,
      reason: 'too_ambiguous_needs_clarification',
    };
  }

  private needsClarificationResponse(route: AiIntentRoute, userMessage: string): boolean {
    if (route.confidence >= 0.55) return false;
    if (route.intent !== 'general_chat') return false;
    const normalized = normalizeSearchText(userMessage || '').trim();
    // Only trigger for short, semantically empty messages
    return normalized.length < 25 && !normalized.includes('?');
  }

  private recordRoutingCase(
    userMessage: string,
    route: AiIntentRoute,
    selectedSkill: string,
    outcome: string,
    error?: string,
  ) {
    const routed = route as AiIntentRoute & {
      classifiedBy?: string;
      ruleIntent?: string;
      ruleReason?: string;
      classifierIntent?: string;
      classifierReason?: string;
    };
    if (routed.classifiedBy !== 'llm' && routed.classifiedBy !== 'rule_after_llm_fail') return;

    appendConfusionCase({
      userMessage,
      ruleIntent: routed.ruleIntent || route.intent,
      ruleReason: routed.ruleReason || route.reason,
      classifierIntent: routed.classifierIntent || route.intent,
      classifierConfidence: route.confidence,
      classifierReason: routed.classifierReason || route.reason,
      selectedSkill,
      outcome,
      error,
    });
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────

  async chat(familyId: string, userMessage: string, userIds: string[] = [], image?: string, modelSelection?: string, sessionId?: string) {
    const trace = createAiTrace('chat', modelSelection || 'groq');

    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);

    const targetUserId = userIds[0] || '';
    const intentRoute = await this.classifyIntentWithFallback(userMessage, !!image);

    // Low-confidence gate: ask user to clarify rather than guess
    if (this.needsClarificationResponse(intentRoute, userMessage)) {
      const clarificationMsg = 'Mình chưa hiểu rõ ý bạn lắm. Bạn có thể nói rõ hơn không? Í bạn đang hỏi về lịch, bóng đá, sổ tay gia đình, hay điều gì khác? 🙏';
      await this.chatService.saveMessage(familyId, 'assistant', clarificationMsg, sessionId);
      const requestLog = appendRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        model: 'direct',
        latencyMs: 0,
        cached: false,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { content: clarificationMsg, familyId, cached: false, direct: true, requestLogId: requestLog.id };
    }

    const routedModel = routeAiModel(modelSelection, intentRoute);

    // Cache check
    const cacheKey = isResponseCacheable(userMessage, !!image, intentRoute)
      ? buildResponseCacheKey({ familyId, userId: targetUserId, model: routedModel.provider, userMessage, intent: intentRoute.intent })
      : undefined;
    const cached = cacheKey ? getCachedResponse(cacheKey) : undefined;
    if (cached) {
      await this.chatService.saveMessage(familyId, 'assistant', cached.content, sessionId);
      const requestLog = appendRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        model: routedModel.provider,
        latencyMs: 0,
        cached: true,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { ...cached, cached: true, requestLogId: requestLog.id };
    }

    const skill = this.skillRegistry.getSkillForIntent(intentRoute.intent as any);
    this.logger.debug(`Selected AI skill ${skill.name} for intent ${intentRoute.intent}`);
    const skillContext = await this.getAiSkillContext(familyId, userMessage, targetUserId, intentRoute.intent, image, trace, sessionId);
    const knowledgeSkill = this.skillRegistry.getAllSkills().find(s => s.name === 'FamilyKnowledgeSkill');

    const directStructuredAction = await this.tryHandleStructuredMemoryEvent(skill, knowledgeSkill, skillContext);
    if (directStructuredAction) {
      await this.chatService.saveMessage(familyId, 'assistant', directStructuredAction, sessionId);
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_structured_memory_event');
      const requestLog = appendRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        skill: skill.name,
        model: 'direct',
        latencyMs: 0,
        cached: false,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { content: directStructuredAction, familyId, cached: false, direct: true, requestLogId: requestLog.id };
    }

    const directCalendarMutation = await this.tryHandleStructuredCalendarMutation(skill, skillContext);
    if (directCalendarMutation) {
      await this.chatService.saveMessage(familyId, 'assistant', directCalendarMutation, sessionId);
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_calendar_mutation');
      const requestLog = appendRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        skill: skill.name,
        model: 'direct',
        latencyMs: 0,
        cached: false,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { content: directCalendarMutation, familyId, cached: false, direct: true, requestLogId: requestLog.id };
    }

    // Direct answer
    if (skill.tryDirectAnswer) {
      const direct = await skill.tryDirectAnswer(skillContext);
      if (direct) {
        await this.chatService.saveMessage(familyId, 'assistant', direct.content, sessionId);
        if (cacheKey) setCachedResponse(cacheKey, { content: direct.content, familyId }, getSkillTtl(intentRoute.intent));
        this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_answer');
        const requestLog = appendRequestLog({
          type: 'chat',
          intent: intentRoute.intent,
          skill: skill.name,
          model: 'direct',
          latencyMs: 0,
          cached: false,
          redacted: false,
          userId: targetUserId || undefined,
          familyId,
          sessionId,
        });
        return { content: direct.content, familyId, cached: false, direct: true, requestLogId: requestLog.id };
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
    const combinedTools = mergeUniqueTools(skillTools, knowledgeTools);

    const baseExecuteToolChat = deps.executeTool;
    deps.executeTool = createSkillToolDispatcher({
      label: 'ToolDispatch/chat',
      logger: this.logger,
      tools: combinedTools,
      skill,
      knowledgeSkill,
      context: skillContext,
      baseExecuteTool: baseExecuteToolChat,
      shouldAllowSideEffectTool: (name) => this.shouldAllowSideEffectTool(name, skillContext),
    });

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
    let requestLogId: string | undefined;
    try {
      result = await (routedModel.provider === 'gemini' ? handleGeminiChat(deps, chatInput) : handleGroqChat(deps, chatInput));
    } catch (err: any) {
      aiError = err?.message || 'Unknown error';
      throw err;
    } finally {
      const requestLog = appendRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        skill: skill.name,
        model: routedModel.provider,
        toolsCalled: combinedTools.map((t: any) => t.function?.name).filter(Boolean),
        ragSnippetCount: skillContext.ragSources?.length ?? 0,
        ragQuery: skillContext.ragQuery,
        ragMiss: skillContext.ragMiss,
        ragSources: skillContext.ragSources,
        latencyMs: Date.now() - t0,
        cached: false,
        redacted: hits.length > 0,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
        error: aiError,
        fallbackReason: this.classifyFallbackReason(aiError),
        tokenCount: result?.usage?.totalTokens,
      });
      requestLogId = requestLog.id;
      this.recordRoutingCase(userMessage, intentRoute, skill.name, aiError ? 'model_error' : 'model_success', aiError);
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

    return { ...result, cached: false, requestLogId };
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

  private async tryHandleStructuredCalendarMutation(skill: any, context: AiSkillContext) {
    if (context.intent !== 'event_mutation') return undefined;

    const calendarSkill = skill?.name === 'CalendarSkill'
      ? skill
      : this.skillRegistry.getAllSkills().find((candidate) => candidate.name === 'CalendarSkill');
    if (!calendarSkill?.executeTool) return undefined;

    const parsed = parseCalendarMutation(context.userMessage || '', context.resolvedFamilyId);
    if (!parsed) return undefined;
    if (parsed.needsClarification) return parsed.needsClarification;

    if (parsed.action === 'create') {
      const dateList = Array.isArray(parsed.args.dateList) ? parsed.args.dateList.filter(Boolean) : [];
      if (dateList.length > 1) {
        const results = [];
        for (const date of dateList) {
          const { dateList: _dateList, endDate: _endDate, ...singleEventArgs } = parsed.args;
          const result = await calendarSkill.executeTool('createEvent', {
            ...singleEventArgs,
            date,
          }, context);
          results.push(result);
        }
        this.logger.debug(`[DirectCalendarMutation] action=create_range count=${results.length}`);
        return this.formatStructuredCalendarMutationResult(parsed.action, parsed.args, results);
      }

      const result = await calendarSkill.executeTool('createEvent', parsed.args, context);
      this.logger.debug(`[DirectCalendarMutation] action=create result=${JSON.stringify(result)}`);
      return this.formatStructuredCalendarMutationResult(parsed.action, parsed.args, result);
    }

    const eventId = parsed.args.id || await this.findSingleEventIdForMutation(calendarSkill, context, parsed);
    if (!eventId) {
      return 'Minh chua tim duoc dung mot su kien khop voi yeu cau. Hay gui ten su kien kem ngay, hoac mo lich va gui lai id su kien.';
    }

    const toolName = parsed.action === 'delete' ? 'deleteEvent' : 'updateEvent';
    const args = {
      ...parsed.args,
      id: eventId,
      familyId: context.resolvedFamilyId || context.familyId,
    };
    const result = await calendarSkill.executeTool(toolName, args, context);
    this.logger.debug(`[DirectCalendarMutation] action=${parsed.action} result=${JSON.stringify(result)}`);
    return this.formatStructuredCalendarMutationResult(parsed.action, args, result);
  }

  private async findSingleEventIdForMutation(calendarSkill: any, context: AiSkillContext, parsed: any) {
    const lookup = parsed.lookup;
    if (!lookup?.title || !lookup.month || !lookup.year) return undefined;

    const result = await calendarSkill.executeTool('getEventsByMonth', {
      familyId: context.resolvedFamilyId || context.familyId,
      month: lookup.month,
      year: lookup.year,
      userId: context.userId,
    }, context);

    const events = Array.isArray(result?.data) ? result.data : [];
    const normalizedTitle = normalizeSearchText(lookup.title);
    const matches = events.filter((event: any) => {
      const eventTitle = normalizeSearchText(event?.title || '');
      const titleMatches = eventTitle.includes(normalizedTitle) || normalizedTitle.includes(eventTitle);
      if (!titleMatches) return false;
      if (!lookup.date) return true;
      const eventDate = event?.date ? new Date(event.date).toISOString().slice(0, 10) : '';
      return eventDate === lookup.date;
    });

    return matches.length === 1 ? matches[0].id : undefined;
  }

  private formatStructuredCalendarMutationResult(action: string, args: any, result: any) {
    if (Array.isArray(result)) {
      const failed = result.filter((item) => item?.ok === false);
      if (failed.length > 0) {
        return failed[0]?.error?.message || 'Khong the tao day du chuoi su kien luc nay.';
      }
    }

    if (result?.ok === false) {
      return result?.error?.message || 'Khong the thuc hien thao tac lich luc nay.';
    }

    if (action === 'delete') {
      return 'Da xoa su kien khoi lich.';
    }

    const date = args.date ? parseCalendarDate(String(args.date)) : undefined;
    const endDate = args.endDate ? parseCalendarDate(String(args.endDate)) : undefined;
    const dateText = endDate
      ? `${date?.display || args.date} - ${endDate.display || args.endDate}`
      : date?.display || args.date || 'chua ro ngay';
    const scopeText = args.scope === 'PRIVATE' ? 'Ca nhan' : 'Gia dinh';
    if (action === 'update') {
      return `Da cap nhat su kien${args.title ? `: ${args.title}` : ''}.\nNgay: ${dateText}${args.time ? `\nGio: ${args.time}` : ''}`;
    }

    return [
      `Đã tạo sự kiện: ${args.title || 'Su kien'}`,
      `Ngày: ${dateText}`,
      `Giờ: ${args.time || '09:00'}`,
      `Phạm vi: ${scopeText}`,
      args.recurring && args.recurring !== 'NONE' ? `Được lặp lại: ${args.recurring}` : undefined,
    ].filter(Boolean).join('\n');
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

    if (memoryResult?.data?.consentRequired) {
      return 'Thong tin nay co ve nhay cam nen minh chua luu vao long memory. Hay xac nhan truoc khi luu vao so tay gia dinh.';
    }

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
    const intentRoute = await this.classifyIntentWithFallback(userMessage, !!image);

    // Low-confidence gate: ask user to clarify rather than guess
    if (this.needsClarificationResponse(intentRoute, userMessage)) {
      const clarificationMsg = 'Mình chưa hiểu rõ ý bạn lắm. Bạn có thể nói rõ hơn không? Ý bạn đang hỏi về lịch, bóng đá, sổ tay gia đình, hay điều gì khác? 🙏';
      await this.chatService.saveMessage(familyId, 'assistant', clarificationMsg, sessionId);
      const requestLog = appendRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        model: 'direct',
        latencyMs: 0,
        cached: false,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: clarificationMsg })}\\n\\n`);
      res.write('data: [DONE]\\n\\n');
      res.end();
      return;
    }

    const routedModel = routeAiModel(modelSelection, intentRoute);

    // Cache check
    const cacheKey = isResponseCacheable(userMessage, !!image, intentRoute)
      ? buildResponseCacheKey({ familyId, userId: targetUserId, model: routedModel.provider, userMessage, intent: intentRoute.intent })
      : undefined;
    const cached = cacheKey ? getCachedResponse(cacheKey) : undefined;

    res.write(`data: ${JSON.stringify({ type: 'status', status: image ? 'uploading_image' : 'generating_answer' })}\n\n`);

    if (cached) {
      const requestLog = appendRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        model: routedModel.provider,
        latencyMs: 0,
        cached: true,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      res.write(`data: ${JSON.stringify({ type: 'cached', cached: true })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: cached.content })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const skill = this.skillRegistry.getSkillForIntent(intentRoute.intent as any);
    this.logger.debug(`Selected AI stream skill ${skill.name} for intent ${intentRoute.intent}`);
    const skillContext = await this.getAiSkillContext(familyId, userMessage, targetUserId, intentRoute.intent, image, trace, sessionId);
    const knowledgeSkill = this.skillRegistry.getAllSkills().find(s => s.name === 'FamilyKnowledgeSkill');

    const directStructuredAction = await this.tryHandleStructuredMemoryEvent(skill, knowledgeSkill, skillContext);
    if (directStructuredAction) {
      await this.chatService.saveMessage(familyId, 'assistant', directStructuredAction, sessionId);
      const requestLog = appendRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        skill: skill.name,
        model: 'direct',
        latencyMs: 0,
        cached: false,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: directStructuredAction })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_structured_memory_event');
      return;
    }

    const directCalendarMutation = await this.tryHandleStructuredCalendarMutation(skill, skillContext);
    if (directCalendarMutation) {
      await this.chatService.saveMessage(familyId, 'assistant', directCalendarMutation, sessionId);
      const requestLog = appendRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        skill: skill.name,
        model: 'direct',
        latencyMs: 0,
        cached: false,
        redacted: false,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
      res.write(`data: ${JSON.stringify({ content: directCalendarMutation })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_calendar_mutation');
      return;
    }

    // Direct answer
    if (skill.tryDirectAnswer) {
      const direct = await skill.tryDirectAnswer(skillContext);
      if (direct) {
        await this.chatService.saveMessage(familyId, 'assistant', direct.content, sessionId);
        if (cacheKey) setCachedResponse(cacheKey, { content: direct.content, familyId }, getSkillTtl(intentRoute.intent));
        const requestLog = appendRequestLog({
          type: 'stream',
          intent: intentRoute.intent,
          skill: skill.name,
          model: 'direct',
          latencyMs: 0,
          cached: false,
          redacted: false,
          userId: targetUserId || undefined,
          familyId,
          sessionId,
        });
        res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: direct.content })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
        this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_answer');
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
    const combinedTools = mergeUniqueTools(skillTools, knowledgeTools);

    const baseExecuteTool = deps.executeTool;
    deps.executeTool = createSkillToolDispatcher({
      label: 'ToolDispatch',
      logger: this.logger,
      tools: combinedTools,
      skill,
      knowledgeSkill,
      context: skillContext,
      baseExecuteTool,
      shouldAllowSideEffectTool: (name) => this.shouldAllowSideEffectTool(name, skillContext),
    });

    const streamInput = {
      familyId, history: skillContext.history || [], familyInfo: skillContext.familyContext || '',
      finalUserMessage: safeStreamMessage, userId: targetUserId, intentRoute, sessionId, trace, res,
      image,
      systemPromptOverride: this.composePrompt(skillContext, skill.getSystemPrompt(skillContext)),
      toolsOverride: combinedTools.length > 0 ? combinedTools : undefined,
    };

    const t1 = Date.now();
    let streamError: string | undefined;
    const requestLog = appendRequestLog({
      type: 'stream',
      intent: intentRoute.intent,
      skill: skill.name,
      model: routedModel.provider,
      toolsCalled: combinedTools.map((t: any) => t.function?.name).filter(Boolean),
      ragSnippetCount: skillContext.ragSources?.length ?? 0,
      ragQuery: skillContext.ragQuery,
      ragMiss: skillContext.ragMiss,
      ragSources: skillContext.ragSources,
      latencyMs: 0,
      cached: false,
      redacted: streamHits.length > 0,
      userId: targetUserId || undefined,
      familyId,
      sessionId,
    });
    res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
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
      updateRequestLog(requestLog.id, {
        toolsCalled: combinedTools.map((t: any) => t.function?.name).filter(Boolean),
        ragSnippetCount: skillContext.ragSources?.length ?? 0,
        ragQuery: skillContext.ragQuery,
        ragMiss: skillContext.ragMiss,
        ragSources: skillContext.ragSources,
        latencyMs: Date.now() - t1,
        cached: false,
        redacted: streamHits.length > 0,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
        error: streamError,
        fallbackReason: this.classifyFallbackReason(streamError),
      });
      this.recordRoutingCase(userMessage, intentRoute, skill.name, streamError ? 'model_error' : 'model_success', streamError);
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

  private classifyFallbackReason(error?: string) {
    if (!error) return undefined;
    const text = error.toLowerCase();
    if (text.includes('failed to call a function') || text.includes('tool')) return 'tool-call failed';
    if (text.includes('rate') || text.includes('429')) return 'rate limit';
    if (text.includes('timeout') || text.includes('timed out')) return 'timeout';
    if (text.includes('vision') || text.includes('image') || text.includes('overload')) return 'vision overload';
    if (text.includes('tavily') || text.includes('search')) return 'search API failed';
    return 'unknown';
  }

  async getSystemStats(filters: { model?: string; skill?: string; status?: 'ok' | 'error' | 'cached'; familyId?: string; hasRag?: 'true' | 'false' } = {}) {
    const { getConfusionStats, getConfusionCases } = require('../ai-confusion-log');
    const [logStats, feedback, recentLogs, topRagSources] = await Promise.all([
      getLogStats(),
      getFeedbackStats(),
      getFilteredRequestLogs(50, filters),
      getTopRetrievedRagSources(10),
    ]);

    return {
      cache: getCacheStats(),
      logStats,
      routingConfusions: {
        stats: getConfusionStats(),
        recent: getConfusionCases(10),
      },
      feedback,
      recentLogs,
      topRagSources,
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

  async addFeedback(input: {
    requestLogId: string;
    value: AiFeedbackValue;
    source?: 'web' | 'telegram' | 'admin';
    userId?: string;
    comment?: string;
  }) {
    const allowed: AiFeedbackValue[] = ['correct', 'wrong', 'missing_context', 'wrong_family', 'wrong_datetime'];
    if (!input.requestLogId || !allowed.includes(input.value)) {
      return { ok: false, error: 'Invalid feedback payload' };
    }

    const log = await addRequestFeedback(input.requestLogId, {
      value: input.value,
      source: input.source || 'web',
      userId: input.userId,
      comment: input.comment,
    });
    if (!log) return { ok: false, error: 'Request log not found or expired' };
    return { ok: true, requestLogId: log.id, feedbackCount: log.feedbacks?.length || 0 };
  }
}
