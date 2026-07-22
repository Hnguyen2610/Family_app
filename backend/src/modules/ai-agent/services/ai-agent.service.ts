import { Injectable, Logger } from '@nestjs/common';
import { ChatService } from './chat.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiIntentRoute, normalizeSearchText } from '../ai-intent-router';
import { AiTrace, createAiTrace } from '../ai-observability';
import {
  handleGeminiChat,
  handleGeminiStream,
  handleGroqChat,
  handleGroqStream,
  type ModelHandlerDeps,
} from '../ai-model-handlers';
import { routeAiModel, type RoutedModel } from '../ai-model-routing';
import { AiSkillRegistry } from '../skills/ai-skill-registry';
import { AiSkillContext } from '../interfaces/ai-skill.interface';
import { composeFullPrompt } from '../ai-agent-prompt';
import { redactSensitiveData } from '../ai-redact';
import { AI_I18N } from '../ai-i18n';
import {
  appendDirectAiRequestLog,
  appendRequestLog,
  configureAiRequestLogPersistence,
  updateRequestLog,
} from '../ai-request-log';
import { createSkillToolDispatcher, mergeUniqueTools } from '../ai-tool-dispatcher';
import { AiFamilyResolver } from '../ai-family-resolver';
import { AiActionProposalService } from './ai-action-proposal.service';
import { AiConversationStateService } from './ai-conversation-state.service';
import { AiEntityResolver } from '../ai-entity-resolver';
import {
  buildSessionCacheKey,
  getSessionCachedResponse,
  setSessionCachedResponse,
} from '../ai-cache';
import { buildAiModelInput, getPrimaryUserId } from '../ai-chat-pipeline';
import {
  buildFallbackExecuteTool,
  getSkillToolsForContext,
  shouldAllowSideEffectTool,
} from '../ai-tool-policy';
import { sanitizeAiResponse, hasRawToolLeakage } from '../ai-response-sanitizer';
import { AiModelClientsService } from './ai-model-clients.service';

@Injectable()
export class AiAgentService {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly aiMaxTokens = Number.parseInt(process.env.AI_MAX_TOKENS || '800', 10);
  private readonly historyLimit = Number.parseInt(process.env.AI_HISTORY_LIMIT || '6', 10);
  private readonly groqContextWindow = Number.parseInt(process.env.GROQ_CONTEXT_WINDOW || '131072', 10);
  private readonly geminiContextWindow = Number.parseInt(process.env.GEMINI_CONTEXT_WINDOW || '1048576', 10);
  private readonly providerFailures = new Map<'groq' | 'gemini', { count: number; openedUntil?: number }>();

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly skillRegistry: AiSkillRegistry,
    private readonly familyResolver: AiFamilyResolver,
    private readonly actionProposalService: AiActionProposalService,
    private readonly conversationState: AiConversationStateService,
    private readonly entityResolver: AiEntityResolver,
    private readonly modelClients: AiModelClientsService,
  ) {
    configureAiRequestLogPersistence(this.prisma);
  }

  // ─── Model deps ─────────────────────────────────────────────────────────────

  private getModelHandlerDeps(modelOverride?: { groqModel?: string; geminiModel?: string }): ModelHandlerDeps {
    return {
      logger: this.logger, openai: this.modelClients.openai, gemini: this.modelClients.gemini, chatService: this.chatService,
      groqModel: modelOverride?.groqModel || this.modelClients.groqModel,
      geminiModel: modelOverride?.geminiModel || this.modelClients.geminiModel,
      aiMaxTokens: this.aiMaxTokens, groqContextWindow: this.groqContextWindow,
      geminiContextWindow: this.geminiContextWindow, historyLimit: this.historyLimit,
      executeTool: buildFallbackExecuteTool(this.logger),
    };
  }

  /**
   * Compose the base prompt plus the persona/rule prose of only the most-recently-invoked
   * skill (if any) — every skill's tools stay available every turn regardless (see
   * setupModelDepsAndTools' combinedTools, which is never filtered); only this supplementary
   * persona text is conditionally included, based on the last-invoked-skill signal persisted
   * in conversation state (AiConversationStatePayload.lastIntent). With no recent signal
   * (e.g. first message in a session), no skill-specific persona prose is included at all.
   */
  private async composePrompt(skillContext: AiSkillContext): Promise<string> {
    const state = await this.conversationState.getState(skillContext.userId);
    return composeFullPrompt(this.skillRegistry, skillContext, state?.lastIntent);
  }

  private async isProviderCircuitOpen(provider: 'groq' | 'gemini'): Promise<boolean> {
    const state = this.providerFailures.get(provider);
    if (state?.openedUntil && state.openedUntil > Date.now()) {
      return true;
    }

    if (this.prisma?.aiRequestLog) {
      try {
        const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
        const failuresCount = await this.prisma.aiRequestLog.count({
          where: {
            model: provider,
            timestamp: { gte: threeMinutesAgo },
            error: { not: null },
          },
        });
        if (failuresCount >= 3) {
          const openedUntil = Date.now() + 3 * 60 * 1000;
          this.providerFailures.set(provider, { count: failuresCount, openedUntil });
          return true;
        }
      } catch (err: any) {
        this.logger.debug(`[CircuitBreaker] DB query failed, using memory state: ${err.message}`);
      }
    }

    return false;
  }

  private markProviderSuccess(provider: 'groq' | 'gemini') {
    this.providerFailures.delete(provider);
  }

  private markProviderFailure(provider: 'groq' | 'gemini') {
    const previous = this.providerFailures.get(provider) || { count: 0 };
    const count = previous.count + 1;
    const openedUntil = count >= 3 ? Date.now() + 3 * 60 * 1000 : previous.openedUntil;
    this.providerFailures.set(provider, { count, openedUntil });
    if (openedUntil) {
      this.logger.warn(`[ModelCircuitBreaker] ${provider} opened for 3 minutes after ${count} failures`);
    }
  }

  private getAlternateModel(routedModel: RoutedModel, reason: string): RoutedModel {
    const provider = routedModel.provider === 'groq' ? 'gemini' : 'groq';
    return {
      provider,
      model: provider === 'gemini' ? this.modelClients.geminiModel : this.modelClients.groqModel,
      route: 'fallback_default',
      reason,
    };
  }

  private async routeAroundOpenCircuit(routedModel: RoutedModel, hasImage: boolean): Promise<RoutedModel> {
    if (hasImage || !await this.isProviderCircuitOpen(routedModel.provider)) return routedModel;
    return this.getAlternateModel(routedModel, `${routedModel.provider} circuit open; using fallback provider`);
  }

  private appendRagCitationLine(content: string, context: AiSkillContext) {
    const sources = (context.ragSources || []).filter((source) => source?.title);
    if (sources.length === 0 || /\bngu[oồ]n\s*:/i.test(content)) return content;

    const titles = Array.from(new Set(sources.map((source) => {
      const category = source.category && source.category !== 'uncategorized' ? `/${source.category}` : '';
      return `${source.title}${category}`;
    }))).slice(0, 2);

    return `${content.trim()}\n\nNguon: ${titles.join('; ')}`;
  }

  private isDailyTaskQuery(userMessage: string) {
    const normalized = normalizeSearchText(userMessage || '');
    const taskSignal = /\b(task|nhiem vu|nhac viec|viec hang ngay|daily task|todo)\b/.test(normalized);
    const readSignal = /\b(co gi|danh sach|xem|liet ke|hom nay|con viec|viec nao|nhung viec)\b/.test(normalized);
    const mutationSignal = /\b(tao|them|sua|doi|xoa|huy|hoan thanh|done|complete|danh dau)\b/.test(normalized);
    return taskSignal && readSignal && !mutationSignal;
  }

  private async tryAnswerDailyTasks(userId: string, userMessage: string) {
    if (!userId || !this.isDailyTaskQuery(userMessage)) return undefined;

    const tasks = await this.prisma.dailyTask.findMany({
      where: { userId, isActive: true },
      orderBy: { priority: 'asc' },
      take: 12,
    });

    const listedTasks = tasks.map((task: any, index: number) => ({
      taskId: task.id,
      title: task.title,
      priority: task.priority ?? index,
      rowNumber: index + 1,
    }));

    // Note: no skill tool is invoked on this deterministic direct-answer path, so we deliberately
    // do not touch lastIntent here — doing so would clobber the last-invoked-skill signal (see
    // AiConversationStatePayload.lastIntent) with a non-skill value. saveState's merge behavior
    // preserves whatever was there before.
    await this.conversationState.saveState(userId, {
      lastShownTasks: listedTasks,
    });

    if (listedTasks.length === 0) {
      return AI_I18N.dailyTaskEmpty;
    }

    return `${AI_I18N.dailyTaskHeader}${listedTasks.map((task) => `${task.rowNumber}. ${task.title}`).join('\n')}`;
  }

  private isActionProposalResult(value: any) {
    return value?.type === 'action_proposal' && value?.proposalId;
  }

  private buildResolverLog(resolution?: { telemetry?: any; candidates?: Array<{ id: string; title: string; type: string; confidence: number; resolverType: string }> }) {
    if (!resolution?.telemetry) return undefined;

    return {
      ...resolution.telemetry,
      candidates: (resolution.candidates || []).slice(0, 5).map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        type: candidate.type,
        confidence: candidate.confidence,
        resolverType: candidate.resolverType,
      })),
    };
  }

  private buildProposalLog(proposal: any) {
    if (!proposal?.proposalId) return undefined;

    return {
      proposalId: proposal.proposalId,
      action: proposal.action,
      targetType: proposal.targetType,
      targetId: proposal.targetId,
      riskLevel: proposal.riskLevel,
      summary: proposal.summary,
      requiresConfirmation: true,
      before: proposal.before,
      after: proposal.after,
    };
  }

  /**
   * There is no keyword/LLM classifier anymore — the model itself decides what to do
   * via tool-calling. This fixed route only exists to satisfy the AiIntentRoute type
   * still threaded through ai-chat-pipeline.ts/ai-model-handlers.ts/ai-cache.ts for
   * prompt/tool-attachment plumbing (see the migration plan's Global Constraints).
   */
  private buildFixedIntentRoute(hasImage: boolean): AiIntentRoute {
    return {
      intent: hasImage ? 'image_vision' : 'general_chat',
      requiresTools: true,
      confidence: 1,
      reason: 'llm_native_tool_routing',
    };
  }

  // ─── Chat ──────────────────────────────────────────────────────────────────

  private createDirectLog(params: {
    type: 'chat' | 'stream';
    source: 'web' | 'telegram' | 'telegram_group' | 'telegram_private';
    intentRoute: AiIntentRoute;
    userMessage: string;
    normalizedPrompt: string;
    targetUserId?: string;
    familyId: string;
    sessionId?: string;
    skill?: string;
    model?: string;
    modelChoiceReason?: string;
    needsClarification?: boolean;
    cached?: boolean;
    proposedAction?: any;
    resolvedFamilyMode?: string;
  }) {
    return appendDirectAiRequestLog({
      type: params.type,
      source: params.source,
      intent: params.intentRoute.intent,
      prompt: params.userMessage,
      normalizedPrompt: params.normalizedPrompt,
      routeReason: params.intentRoute.reason,
      routeConfidence: params.intentRoute.confidence,
      userId: params.targetUserId,
      familyId: params.familyId,
      sessionId: params.sessionId,
      skill: params.skill,
      model: params.model,
      modelChoiceReason: params.modelChoiceReason,
      needsClarification: params.needsClarification,
      cached: params.cached,
      proposedAction: params.proposedAction,
      resolvedFamilyMode: params.resolvedFamilyMode,
    });
  }

  private async executeEarlyReturnPipeline(
    familyId: string,
    userMessage: string,
    userIds: string[],
    sessionId: string | undefined,
    modelSelection: string | undefined,
    image: string | undefined,
    source: 'web' | 'telegram' | 'telegram_group' | 'telegram_private',
    mode: 'chat' | 'stream',
    res?: any,
  ): Promise<
    | { handled: true; result: any }
    | {
        handled: false;
        targetUserId: string | undefined;
        intentRoute: AiIntentRoute;
        normalizedPrompt: string;
        routedModel: RoutedModel;
        cacheKey: string | undefined;
        skillContext: AiSkillContext;
        trace: AiTrace;
      }
  > {
    const trace = createAiTrace(mode, modelSelection || 'groq', res);
    const normalizedPrompt = normalizeSearchText(userMessage || '').trim();
    const targetUserId = getPrimaryUserId(userIds);
    const intentRoute = this.buildFixedIntentRoute(!!image);

    const routedModel = await this.routeAroundOpenCircuit(routeAiModel(modelSelection, !!image), !!image);

    // Cache check
    const cacheKey = buildSessionCacheKey({
      familyId,
      userId: targetUserId,
      model: routedModel.provider,
      userMessage,
      hasImage: !!image,
    });
    const cached = getSessionCachedResponse(cacheKey);

    if (mode === 'stream') {
      res.write(`data: ${JSON.stringify({ type: 'status', status: image ? 'uploading_image' : 'generating_answer' })}\n\n`);
    }

    if (cached) {
      if (mode === 'chat') {
        await this.chatService.saveMessage(familyId, 'assistant', cached.content, sessionId);
      }
      const requestLog = this.createDirectLog({
        type: mode, source, intentRoute, userMessage, normalizedPrompt,
        targetUserId, familyId, sessionId, cached: true,
        model: routedModel.provider, modelChoiceReason: routedModel.reason,
      });
      if (mode === 'stream') {
        res.write(`data: ${JSON.stringify({ type: 'cached', cached: true })}\n\n`);
        res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: cached.content })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return { handled: true, result: { ...cached, cached: true, requestLogId: requestLog.id } };
    }

    const skillContext = await this.familyResolver.buildSkillContext({
      familyId,
      userMessage,
      userId: targetUserId,
      intent: intentRoute.intent,
      image,
      trace,
      sessionId,
      historyLimit: this.historyLimit,
      source,
    });

    const dailyTaskAnswer = await this.tryAnswerDailyTasks(targetUserId, userMessage);
    if (dailyTaskAnswer) {
      await this.chatService.saveMessage(familyId, 'assistant', dailyTaskAnswer, sessionId);
      const requestLog = this.createDirectLog({
        type: mode, source, intentRoute, userMessage, normalizedPrompt,
        targetUserId, familyId, sessionId,
        skill: 'DailyTasksDirect', model: 'direct', modelChoiceReason: 'deterministic daily task list',
        resolvedFamilyMode: skillContext.resolvedFamilyMode,
      });
      if (mode === 'stream') {
        res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: dailyTaskAnswer })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return { handled: true, result: { content: dailyTaskAnswer, familyId, cached: false, direct: true, requestLogId: requestLog.id } };
    }

    for (const candidateSkill of this.skillRegistry.getAllSkills()) {
      if (!candidateSkill.tryDirectAnswer) continue;
      const direct = await candidateSkill.tryDirectAnswer(skillContext);
      if (!direct) continue;

      await this.chatService.saveMessage(familyId, 'assistant', direct.content, sessionId);
      setSessionCachedResponse(cacheKey, { content: direct.content, familyId });
      const requestLog = this.createDirectLog({
        type: mode, source, intentRoute, userMessage, normalizedPrompt,
        targetUserId, familyId, sessionId, skill: candidateSkill.name, model: routedModel.provider,
        modelChoiceReason: routedModel.reason,
      });
      if (mode === 'stream') {
        res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: direct.content })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return { handled: true, result: { content: direct.content, familyId, cached: false, direct: true, requestLogId: requestLog.id } };
    }

    return {
      handled: false,
      targetUserId,
      intentRoute,
      normalizedPrompt,
      routedModel,
      cacheKey,
      skillContext,
      trace,
    };
  }

  private setupModelDepsAndTools(
    routedModel: RoutedModel,
    skillContext: AiSkillContext,
    userMessage: string,
    intentRoute: AiIntentRoute,
    debugState: {
      resolverTelemetry?: Record<string, unknown>;
      proposedAction?: Record<string, unknown>;
      sanitizerIncidents: Array<Record<string, unknown>>;
      needsClarification: boolean;
      invokedToolNames: string[];
    },
  ) {
    const deps = this.getModelHandlerDeps(
      routedModel.provider === 'groq'
        ? { groqModel: routedModel.model }
        : { geminiModel: routedModel.model }
    );
    deps.onSanitizerIncident = (incident: Record<string, unknown>) => {
      debugState.sanitizerIncidents.push(incident);
    };
    deps.decorateAssistantContent = (content: string) => this.appendRagCitationLine(content, skillContext);

    // Redact PII before sending to external AI provider
    const { redacted: safeMessage, hits } = redactSensitiveData(userMessage, intentRoute.intent);
    if (hits.length > 0) this.logger.warn(`Redacted PII in message: ${hits.join(', ')}`);

    const allSkills = this.skillRegistry.getAllSkills();
    const toolOwners = this.skillRegistry.getAllToolOwners();
    const combinedTools = mergeUniqueTools(
      ...allSkills.map((candidateSkill) => getSkillToolsForContext(candidateSkill, skillContext)),
    );

    const baseExecuteTool = deps.executeTool;
    const skillToolDispatcher = createSkillToolDispatcher({
      label: 'ToolDispatch',
      logger: this.logger,
      tools: combinedTools,
      toolOwners,
      context: skillContext,
      baseExecuteTool,
      shouldAllowSideEffectTool: (name) => shouldAllowSideEffectTool(name, skillContext),
      createActionProposal: (toolName, args, context) => this.actionProposalService.createToolProposal(toolName, args, context),
    });

    deps.executeTool = async (toolName: string, args: any, currentFamilyId: string, currentUserId: string) => {
      if ((toolName === 'updateEvent' || toolName === 'deleteEvent') && (!args.id || args.id === 'this' || args.id === 'that' || /^\d+$/.test(args.id))) {
        const resolution = await this.entityResolver.resolveEvent(currentUserId, skillContext.userMessage || '', currentFamilyId);
        debugState.resolverTelemetry = this.buildResolverLog(resolution);
        if (resolution.resolved) {
          this.logger.log(`[EntityResolver] Auto-resolved ${toolName} ID to ${resolution.resolved.id}`);
          args.id = resolution.resolved.id;
        } else if (resolution.candidates.length > 1) {
          debugState.needsClarification = true;
          return {
            error: true,
            needsClarification: true,
            message: AI_I18N.eventCandidateList(resolution.candidates.length, resolution.candidates.map((c, i) => `${i + 1}. "${c.title}"`).join('\n')),
          };
        }
      }

      debugState.invokedToolNames.push(toolName);
      const result = await skillToolDispatcher(toolName, args, currentFamilyId, currentUserId);
      if (result?.needsClarification) {
        debugState.needsClarification = true;
      }
      if (this.isActionProposalResult(result)) {
        debugState.proposedAction = this.buildProposalLog(result);
      }

      if (toolName === 'getEventsByMonth' && result?.ok && Array.isArray(result.data)) {
        const sortedEvents = [...result.data].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const listedEvents = sortedEvents.slice(0, 12).map((event: any, index: number) => ({
          eventId: event.id,
          date: new Date(event.date).toISOString().split('T')[0],
          time: event.time || undefined,
          title: event.title,
          scope: event.scope,
          familyId: event.familyId,
          rowNumber: index + 1,
        }));
        await this.conversationState.saveState(currentUserId, {
          lastShownEvents: listedEvents,
          lastSelectedFamilyId: skillContext.resolvedFamilyId || currentFamilyId,
          // Repurposed field: records the skill that owns the tool just invoked (see
          // AiConversationStatePayload.lastIntent), not a classified intent.
          lastIntent: toolOwners.get(toolName)?.name || 'CalendarSkill',
        });
      }

      return result;
    };

    return { deps, combinedTools, safeMessage, hits, toolOwners };
  }

  private logInterceptedMutations(content: string) {
    const pattern = /<function:(\w+)\s+([^>]+)>/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      this.logger.warn(`[Mutation Interceptor] BLOCKED hallucinated tool call: ${match[1]} (not executed)`);
    }
  }

  private async prepareChatTurn(
    familyId: string,
    userMessage: string,
    userIds: string[],
    sessionId: string | undefined,
    modelSelection: string | undefined,
    image: string | undefined,
    source: 'web' | 'telegram' | 'telegram_group' | 'telegram_private',
    mode: 'chat' | 'stream',
    res?: any,
  ): Promise<
    | { handled: true; result: any }
    | {
        handled: false;
        targetUserId: string | undefined;
        intentRoute: AiIntentRoute;
        normalizedPrompt: string;
        routedModel: RoutedModel;
        cacheKey: string | undefined;
        skillContext: AiSkillContext;
        trace: AiTrace;
        debugState: {
          resolverTelemetry?: Record<string, unknown>;
          proposedAction?: Record<string, unknown>;
          sanitizerIncidents: Array<Record<string, unknown>>;
          needsClarification: boolean;
          invokedToolNames: string[];
        };
        deps: ModelHandlerDeps;
        combinedTools: any[];
        safeMessage: string;
        hits: string[];
        toolOwners: Map<string, any>;
        modelInput: ReturnType<typeof buildAiModelInput>;
      }
  > {
    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);
    const pipeline = await this.executeEarlyReturnPipeline(familyId, userMessage, userIds, sessionId, modelSelection, image, source, mode, res);
    if (pipeline.handled) return pipeline;

    const { targetUserId, intentRoute, normalizedPrompt, routedModel, cacheKey, skillContext, trace } = pipeline;
    const debugState = {
      sanitizerIncidents: [] as Array<Record<string, unknown>>,
      needsClarification: false,
      invokedToolNames: [] as string[],
    };

    const { deps, combinedTools, safeMessage, hits, toolOwners } = this.setupModelDepsAndTools(
      routedModel!,
      skillContext!,
      userMessage,
      intentRoute!,
      debugState,
    );

    const basePrompt = await this.composePrompt(skillContext!);
    const wordCount = (userMessage || '').trim().split(/\s+/).filter(Boolean).length;
    const systemPromptOverride = wordCount > 10
      ? `${basePrompt}\n\n[CHAIN_OF_THOUGHT RULE]\nBạn BẮT BUỘC phải suy nghĩ từng bước trước khi bắt đầu trả lời hoặc gọi công cụ. Viết toàn bộ suy nghĩ (reasoning steps/thought process) của bạn bằng tiếng Việt bên trong cặp thẻ <thought>...</thought> ở ngay đầu câu trả lời (Ví dụ: <thought>Phân tích câu hỏi... Xác định tool...</thought>). Thẻ này phải nằm trên cùng và bao quanh toàn bộ logic suy nghĩ của bạn. Không được bỏ qua thẻ này.`
      : basePrompt;

    const modelInput = buildAiModelInput({
      familyId,
      skillContext: skillContext!,
      finalUserMessage: safeMessage,
      userId: targetUserId || '',
      intentRoute: intentRoute!,
      sessionId,
      trace: trace!,
      res,
      image,
      systemPromptOverride,
      toolsOverride: combinedTools,
    });

    return {
      handled: false,
      targetUserId,
      intentRoute: intentRoute!,
      normalizedPrompt: normalizedPrompt!,
      routedModel: routedModel!,
      cacheKey,
      skillContext: skillContext!,
      trace: trace!,
      debugState,
      deps,
      combinedTools,
      safeMessage,
      hits,
      toolOwners,
      modelInput,
    };
  }

  async chat(
    familyId: string,
    userMessage: string,
    userIds: string[] = [],
    image?: string,
    modelSelection?: string,
    sessionId?: string,
    source: 'web' | 'telegram' | 'telegram_group' | 'telegram_private' = 'web',
  ) {
    const prep = await this.prepareChatTurn(familyId, userMessage, userIds, sessionId, modelSelection, image, source, 'chat');
    if (prep.handled) return prep.result;

    const { targetUserId, intentRoute, normalizedPrompt, routedModel, cacheKey, skillContext, debugState, deps, toolOwners, hits, modelInput: chatInput } = prep;

    const t0 = Date.now();
    let aiError: string | undefined;
    let recoveredFallbackReason: string | undefined;
    let result: any;
    let requestLogId: string | undefined;
    try {
      try {
        result = await (routedModel.provider === 'gemini' ? handleGeminiChat(deps, chatInput) : handleGroqChat(deps, chatInput));
        this.markProviderSuccess(routedModel.provider);
      } catch (err: any) {
        this.markProviderFailure(routedModel.provider);
        if (!image) {
          const fallbackModel = this.getAlternateModel(routedModel, `${routedModel.provider} failed; retried with fallback provider`);
          const fallbackDeps = this.getModelHandlerDeps(
            fallbackModel.provider === 'groq'
              ? { groqModel: fallbackModel.model }
              : { geminiModel: fallbackModel.model },
          );
          fallbackDeps.onSanitizerIncident = deps.onSanitizerIncident;
          fallbackDeps.decorateAssistantContent = deps.decorateAssistantContent;
          fallbackDeps.executeTool = deps.executeTool;
          result = await (fallbackModel.provider === 'gemini' ? handleGeminiChat(fallbackDeps, chatInput) : handleGroqChat(fallbackDeps, chatInput));
          this.markProviderSuccess(fallbackModel.provider);
          recoveredFallbackReason = `${routedModel.provider} failed; recovered with ${fallbackModel.provider}`;
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      aiError = err?.message || 'Unknown error';
      throw err;
    } finally {
      const invokedSkillName = toolOwners.get(debugState.invokedToolNames[0])?.name || 'GeneralChatSkill';
      const requestLog = appendRequestLog({
        type: 'chat',
        source,
        intent: intentRoute.intent,
        prompt: userMessage,
        normalizedPrompt,
        skill: invokedSkillName,
        model: routedModel.provider,
        routeReason: intentRoute.reason,
        routeConfidence: intentRoute.confidence,
        modelChoiceReason: routedModel.reason,
        toolsCalled: debugState.invokedToolNames,
        ragSnippetCount: skillContext.ragSources?.length ?? 0,
        ragQuery: skillContext.ragQuery,
        ragMiss: skillContext.ragMiss,
        ragSources: skillContext.ragSources,
        resolverTelemetry: debugState.resolverTelemetry,
        proposedAction: debugState.proposedAction,
        sanitizerIncidents: debugState.sanitizerIncidents,
        needsClarification: debugState.needsClarification,
        latencyMs: Date.now() - t0,
        cached: false,
        redacted: hits.length > 0,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
        error: aiError,
        fallbackReason: recoveredFallbackReason || this.classifyFallbackReason(aiError),
        tokenCount: result?.usage?.totalTokens,
        resolvedFamilyMode: skillContext.resolvedFamilyMode,
      });
      requestLogId = requestLog.id;

      // Persist the last-invoked-skill signal only when a real tool was actually invoked this
      // turn — the 'GeneralChatSkill' fallback above is a logging convenience, not a genuine
      // "this skill was relevant" signal, so we must not let it clobber the previous value.
      if (targetUserId && debugState.invokedToolNames.length > 0) {
        await this.conversationState.saveState(targetUserId, { lastIntent: invokedSkillName });
      }
    }
    // Handle pseudo-function calls (hallucinations or text-based tools)
    if (result.content && hasRawToolLeakage(result.content)) {
      const sanitized = sanitizeAiResponse(result.content);
      if (sanitized.sanitized) {
        debugState.sanitizerIncidents.push({
          stage: 'post_chat_response',
          reasons: sanitized.reasons,
          blocked: true,
        });
      }
      // SECURITY: Do NOT execute hallucinated tool calls. Only log + strip.
      this.logInterceptedMutations(result.content);
      result = { ...result, content: sanitized.content };
      if (requestLogId) {
        updateRequestLog(requestLogId, {
          sanitizerIncidents: debugState.sanitizerIncidents,
        });
      }
    }

    setSessionCachedResponse(cacheKey, result);

    return { ...result, cached: false, requestLogId };
  }

  async chatStream(
    familyId: string,
    userMessage: string,
    userIds: string[],
    res: any,
    sessionId?: string,
    image?: string,
    modelSelection?: string,
    source: 'web' | 'telegram' | 'telegram_group' | 'telegram_private' = 'web',
  ) {
    const prep = await this.prepareChatTurn(familyId, userMessage, userIds, sessionId, modelSelection, image, source, 'stream', res);
    if (prep.handled) return prep.result;

    const { targetUserId, intentRoute, normalizedPrompt, routedModel, skillContext, debugState, deps, toolOwners, hits, modelInput: streamInput } = prep;

    const t1 = Date.now();
    let streamError: string | undefined;
    const requestLog = appendRequestLog({
      type: 'stream',
      source,
      intent: intentRoute.intent,
      prompt: userMessage,
      normalizedPrompt,
      skill: toolOwners.get(debugState.invokedToolNames[0])?.name || 'GeneralChatSkill',
      model: routedModel.provider,
      routeReason: intentRoute.reason,
      routeConfidence: intentRoute.confidence,
      modelChoiceReason: routedModel.reason,
      toolsCalled: debugState.invokedToolNames,
      ragSnippetCount: skillContext.ragSources?.length ?? 0,
      ragQuery: skillContext.ragQuery,
      ragMiss: skillContext.ragMiss,
      ragSources: skillContext.ragSources,
      resolverTelemetry: debugState.resolverTelemetry,
      proposedAction: debugState.proposedAction,
      sanitizerIncidents: debugState.sanitizerIncidents,
      needsClarification: debugState.needsClarification,
      latencyMs: 0,
      cached: false,
      redacted: hits.length > 0,
      userId: targetUserId || undefined,
      familyId,
      sessionId,
      resolvedFamilyMode: skillContext.resolvedFamilyMode,
    });
    res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
    try {
      if (routedModel.provider === 'gemini') {
        await handleGeminiStream(deps, streamInput);
      } else {
        await handleGroqStream(deps, streamInput);
      }
      this.markProviderSuccess(routedModel.provider);
    } catch (err: any) {
      streamError = err?.message || 'Unknown error';
      this.markProviderFailure(routedModel.provider);
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
      const invokedSkillName = toolOwners.get(debugState.invokedToolNames[0])?.name || 'GeneralChatSkill';
      updateRequestLog(requestLog.id, {
        source,
        prompt: userMessage,
        normalizedPrompt,
        skill: invokedSkillName,
        routeReason: intentRoute.reason,
        routeConfidence: intentRoute.confidence,
        modelChoiceReason: routedModel.reason,
        toolsCalled: debugState.invokedToolNames,
        ragSnippetCount: skillContext.ragSources?.length ?? 0,
        ragQuery: skillContext.ragQuery,
        ragMiss: skillContext.ragMiss,
        ragSources: skillContext.ragSources,
        resolverTelemetry: debugState.resolverTelemetry,
        proposedAction: debugState.proposedAction,
        sanitizerIncidents: debugState.sanitizerIncidents,
        needsClarification: debugState.needsClarification,
        latencyMs: Date.now() - t1,
        cached: false,
        redacted: hits.length > 0,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
        error: streamError,
        fallbackReason: this.classifyFallbackReason(streamError),
      });

      // Persist the last-invoked-skill signal only when a real tool was actually invoked this
      // turn — the 'GeneralChatSkill' fallback above is a logging convenience, not a genuine
      // "this skill was relevant" signal, so we must not let it clobber the previous value.
      if (targetUserId && debugState.invokedToolNames.length > 0) {
        await this.conversationState.saveState(targetUserId, { lastIntent: invokedSkillName });
      }
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

  async generateBriefingText(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.modelClients.openai.chat.completions.create({
        model: this.modelClients.groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 500,
      });
      return response.choices[0].message.content || '';
    } catch (err) {
      this.logger.warn(`Failed to generate briefing via Groq, falling back to Gemini: ${err}`);
      try {
        const model = this.modelClients.gemini.getGenerativeModel({
          model: this.modelClients.geminiModel,
          systemInstruction: systemPrompt,
        });
        const result = await model.generateContent(userPrompt);
        return result.response.text();
      } catch (geminiErr) {
        this.logger.error(`Failed to generate briefing via Gemini as well: ${geminiErr}`);
        throw new Error('All LLM providers failed for daily briefing generation.');
      }
    }
  }
}
