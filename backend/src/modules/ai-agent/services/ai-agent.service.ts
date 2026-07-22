import { Injectable, Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './chat.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { HoroscopeService } from './horoscope.service';
import { AiIntentRoute, classifyAiIntent, normalizeSearchText } from '../ai-intent-router';
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
import { AiSkill, AiSkillContext } from '../interfaces/ai-skill.interface';
import { buildSystemPrompt } from '../ai-agent-prompt';
import { redactSensitiveData } from '../ai-redact';
import { AI_I18N } from '../ai-i18n';
import {
  addRequestFeedback,
  appendDirectAiRequestLog,
  appendConfusionCase,
  appendRequestLog,
  configureAiRequestLogPersistence,
  getConfusionCases,
  getConfusionStats,
  getAiRequestTelemetry,
  updateRequestLog,
  type AiFeedbackValue,
} from '../ai-request-log';
import { AiIntentClassifier } from '../ai-intent-classifier';
import { createSkillToolDispatcher, mergeUniqueTools } from '../ai-tool-dispatcher';
import { AiFamilyResolver } from '../ai-family-resolver';
import { AiStructuredActionHandler } from '../ai-structured-action-handler';
import { AiActionProposalService } from './ai-action-proposal.service';
import { AiConversationStateService } from './ai-conversation-state.service';
import { AiEntityResolver } from '../ai-entity-resolver';
import {
  buildSessionCacheKey,
  getSessionCachedResponse,
  getSessionCacheStats,
  setSessionCachedResponse,
} from '../ai-cache';
import { buildAiModelInput, getPrimaryUserId } from '../ai-chat-pipeline';
import {
  buildFallbackExecuteTool,
  getSkillToolsForContext,
  shouldAllowKnowledgeOrAutoWrite,
  shouldAllowSideEffectTool,
} from '../ai-tool-policy';
import { sanitizeAiResponse, hasRawToolLeakage } from '../ai-response-sanitizer';

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
  private readonly intentClassifier: AiIntentClassifier;
  private readonly providerFailures = new Map<'groq' | 'gemini', { count: number; openedUntil?: number }>();

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly skillRegistry: AiSkillRegistry,
    private readonly horoscopeService: HoroscopeService,
    private readonly familyResolver: AiFamilyResolver,
    private readonly structuredActionHandler: AiStructuredActionHandler,
    private readonly actionProposalService: AiActionProposalService,
    private readonly conversationState: AiConversationStateService,
    private readonly entityResolver: AiEntityResolver,
  ) {
    this.openai = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
    this.intentClassifier = new AiIntentClassifier(
      this.openai,
      process.env.AI_INTENT_CLASSIFIER_MODEL || 'llama-3.1-8b-instant',
    );
    configureAiRequestLogPersistence(this.prisma);
  }

  // ─── Model deps ─────────────────────────────────────────────────────────────

  private getModelHandlerDeps(modelOverride?: { groqModel?: string; geminiModel?: string }): ModelHandlerDeps {
    return {
      logger: this.logger, openai: this.openai, gemini: this.gemini, chatService: this.chatService,
      groqModel: modelOverride?.groqModel || this.groqModel,
      geminiModel: modelOverride?.geminiModel || this.geminiModel,
      aiMaxTokens: this.aiMaxTokens, groqContextWindow: this.groqContextWindow,
      geminiContextWindow: this.geminiContextWindow, historyLimit: this.historyLimit,
      executeTool: buildFallbackExecuteTool(this.logger),
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
      model: provider === 'gemini' ? this.geminiModel : this.groqModel,
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

    await this.conversationState.saveState(userId, {
      lastShownTasks: listedTasks,
      lastIntent: 'daily_tasks',
    });

    if (listedTasks.length === 0) {
      return AI_I18N.dailyTaskEmpty;
    }

    return `${AI_I18N.dailyTaskHeader}${listedTasks.map((task) => `${task.rowNumber}. ${task.title}`).join('\n')}`;
  }

  private isActionProposalResult(value: any) {
    return value?.type === 'action_proposal' && value?.proposalId;
  }

  private getDirectResultContent(value: any) {
    if (this.isActionProposalResult(value)) {
      if (value.summary) return `${value.summary}\n\n${AI_I18N.actionProposalDefaultContent}`;
      return value.message || `Mình đã chuẩn bị thao tác này. ${AI_I18N.actionProposalDefaultContent}`;
    }
    return String(value || '');
  }

  private getDirectResultProposal(value: any) {
    return this.isActionProposalResult(value) ? value : undefined;
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

  private async classifyIntentWithFallback(userMessage: string, hasImage: boolean): Promise<AiIntentRoute> {
    const ruleRoute = classifyAiIntent(userMessage, hasImage);
    if (!this.intentClassifier.shouldUseLlmFallback(ruleRoute, userMessage, hasImage)) {
      return ruleRoute;
    }
    return this.intentClassifier.classify(userMessage, ruleRoute);
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
        skill: AiSkill;
        knowledgeSkill: AiSkill | undefined;
        skillContext: AiSkillContext;
        trace: AiTrace;
      }
  > {
    const trace = createAiTrace(mode, modelSelection || 'groq', res);
    const normalizedPrompt = normalizeSearchText(userMessage || '').trim();
    const targetUserId = getPrimaryUserId(userIds);
    const intentRoute = await this.classifyIntentWithFallback(userMessage, !!image);

    // Low-confidence gate: ask user to clarify rather than guess
    if (this.needsClarificationResponse(intentRoute, userMessage)) {
      const clarificationMsg = AI_I18N.clarification + (mode === 'stream' ? ' 🙏' : '');
      if (mode === 'chat') {
        await this.chatService.saveMessage(familyId, 'assistant', clarificationMsg, sessionId);
      }
      const requestLog = this.createDirectLog({
        type: mode, source, intentRoute, userMessage, normalizedPrompt,
        targetUserId, familyId, sessionId, needsClarification: true,
      });
      if (mode === 'stream') {
        await this.chatService.saveMessage(familyId, 'assistant', clarificationMsg, sessionId);
        res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
        res.write(`data: ${JSON.stringify({ content: clarificationMsg })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return { handled: true, result: { content: clarificationMsg, familyId, cached: false, direct: true, requestLogId: requestLog.id } };
    }

    const routedModel = await this.routeAroundOpenCircuit(routeAiModel(modelSelection, intentRoute), !!image);

    // Cache check
    const cacheKey = buildSessionCacheKey({
      familyId,
      userId: targetUserId,
      model: routedModel.provider,
      userMessage,
      intentRoute,
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

    const skill = this.skillRegistry.getSkillForIntent(intentRoute.intent);
    this.logger.debug(`Selected AI skill ${skill.name} for intent ${intentRoute.intent}`);
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

    if (skillContext.ragSources && skillContext.ragSources.length > 0) {
      const listedNotes = skillContext.ragSources.map((doc: any, index: number) => ({
        noteId: doc.documentId || doc.id,
        title: doc.title,
        familyId: doc.familyId,
        category: doc.sourceType || 'note',
        rowNumber: index + 1,
      }));
      await this.conversationState.saveState(targetUserId, {
        lastShownNotes: listedNotes,
      });
    }

    const knowledgeSkill = this.skillRegistry.getAllSkills().find(s => s.name === 'FamilyKnowledgeSkill');

    const directStructuredAction = await this.structuredActionHandler.tryHandleStructuredMemoryEvent(skill, knowledgeSkill, skillContext);
    if (directStructuredAction) {
      const content = this.getDirectResultContent(directStructuredAction);
      const proposal = this.getDirectResultProposal(directStructuredAction);
      const proposedAction = this.buildProposalLog(proposal);
      await this.chatService.saveMessage(familyId, 'assistant', content, sessionId);
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_structured_memory_event');
      const requestLog = this.createDirectLog({
        type: mode, source, intentRoute, userMessage, normalizedPrompt,
        targetUserId, familyId, sessionId, skill: skill.name, model: routedModel.provider,
        modelChoiceReason: routedModel.reason, proposedAction,
      });
      if (mode === 'stream') {
        res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
        if (proposal) res.write(`data: ${JSON.stringify({ type: 'action_proposal', proposal })}\n\n`);
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return {
        handled: true,
        result: { content, familyId, cached: false, direct: true, requestLogId: requestLog.id, proposal },
      };
    }

    const directCalendarMutation = await this.structuredActionHandler.tryHandleStructuredCalendarMutation(skill, skillContext);
    if (directCalendarMutation) {
      const content = this.getDirectResultContent(directCalendarMutation);
      const proposal = this.getDirectResultProposal(directCalendarMutation);
      const proposedAction = this.buildProposalLog(proposal);
      const needsClarification = typeof directCalendarMutation === 'string' && /chon dong nao|which specific family|chua tim duoc|hay gui ten/i.test(normalizeSearchText(content));
      await this.chatService.saveMessage(familyId, 'assistant', content, sessionId);
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_calendar_mutation');
      const requestLog = this.createDirectLog({
        type: mode, source, intentRoute, userMessage, normalizedPrompt,
        targetUserId, familyId, sessionId, skill: skill.name, model: routedModel.provider,
        modelChoiceReason: routedModel.reason, proposedAction, needsClarification,
      });
      if (mode === 'stream') {
        res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
        if (proposal) res.write(`data: ${JSON.stringify({ type: 'action_proposal', proposal })}\n\n`);
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
      return {
        handled: true,
        result: { content, familyId, cached: false, direct: true, requestLogId: requestLog.id, proposal },
      };
    }

    if (skill.tryDirectAnswer) {
      const direct = await skill.tryDirectAnswer(skillContext);
      if (direct) {
        await this.chatService.saveMessage(familyId, 'assistant', direct.content, sessionId);
        setSessionCachedResponse(cacheKey, { content: direct.content, familyId }, intentRoute.intent);
        this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_answer');
        const requestLog = this.createDirectLog({
          type: mode, source, intentRoute, userMessage, normalizedPrompt,
          targetUserId, familyId, sessionId, skill: skill.name, model: routedModel.provider,
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
    }

    return {
      handled: false,
      targetUserId,
      intentRoute,
      normalizedPrompt,
      routedModel,
      cacheKey,
      skill,
      knowledgeSkill,
      skillContext,
      trace,
    };
  }

  private setupModelDepsAndTools(
    routedModel: RoutedModel,
    skill: AiSkill,
    knowledgeSkill: AiSkill | undefined,
    skillContext: AiSkillContext,
    userMessage: string,
    intentRoute: AiIntentRoute,
    debugState: {
      resolverTelemetry?: Record<string, unknown>;
      proposedAction?: Record<string, unknown>;
      sanitizerIncidents: Array<Record<string, unknown>>;
      needsClarification: boolean;
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

    const allowKnowledgeWrite = shouldAllowKnowledgeOrAutoWrite(skillContext);
    const skillTools = getSkillToolsForContext(skill, skillContext);
    const knowledgeTools = knowledgeSkill?.getTools && allowKnowledgeWrite ? knowledgeSkill.getTools() : [];
    const combinedTools = mergeUniqueTools(skillTools, knowledgeTools);

    const baseExecuteTool = deps.executeTool;
    const skillToolDispatcher = createSkillToolDispatcher({
      label: 'ToolDispatch',
      logger: this.logger,
      tools: combinedTools,
      skill,
      knowledgeSkill,
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
          lastIntent: intentRoute.intent,
        });
      }

      return result;
    };

    return { deps, combinedTools, safeMessage, hits };
  }

  private logInterceptedMutations(content: string) {
    const pattern = /<function:(\w+)\s+([^>]+)>/g;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      this.logger.warn(`[Mutation Interceptor] BLOCKED hallucinated tool call: ${match[1]} (not executed)`);
    }
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
    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);
    const pipeline = await this.executeEarlyReturnPipeline(familyId, userMessage, userIds, sessionId, modelSelection, image, source, 'chat');
    if (pipeline.handled) return pipeline.result;

    const { targetUserId, intentRoute, normalizedPrompt, routedModel, cacheKey, skill, knowledgeSkill, skillContext, trace } = pipeline;
    const debugState: {
      resolverTelemetry?: Record<string, unknown>;
      proposedAction?: Record<string, unknown>;
      sanitizerIncidents: Array<Record<string, unknown>>;
      needsClarification: boolean;
    } = {
      sanitizerIncidents: [],
      needsClarification: false,
    };

    const { deps, combinedTools, safeMessage, hits } = this.setupModelDepsAndTools(
      routedModel!,
      skill,
      knowledgeSkill,
      skillContext!,
      userMessage,
      intentRoute!,
      debugState,
    );

    const basePrompt = this.composePrompt(skillContext!, skill.getSystemPrompt(skillContext!));
    const wordCount = (userMessage || '').trim().split(/\s+/).filter(Boolean).length;
    const systemPromptOverride = wordCount > 10
      ? `${basePrompt}\n\n[CHAIN_OF_THOUGHT RULE]\nBạn BẮT BUỘC phải suy nghĩ từng bước trước khi bắt đầu trả lời hoặc gọi công cụ. Viết toàn bộ suy nghĩ (reasoning steps/thought process) của bạn bằng tiếng Việt bên trong cặp thẻ <thought>...</thought> ở ngay đầu câu trả lời (Ví dụ: <thought>Phân tích câu hỏi... Xác định tool...</thought>). Thẻ này phải nằm trên cùng và bao quanh toàn bộ logic suy nghĩ của bạn. Không được bỏ qua thẻ này.`
      : basePrompt;

    const chatInput = buildAiModelInput({
      familyId,
      skillContext: skillContext!,
      finalUserMessage: safeMessage,
      userId: targetUserId || '',
      intentRoute: intentRoute!,
      sessionId,
      trace: trace!,
      image,
      systemPromptOverride,
      toolsOverride: combinedTools,
    });

    const t0 = Date.now();
    let aiError: string | undefined;
    let recoveredFallbackReason: string | undefined;
    let result: any;
    let requestLogId: string | undefined;
    try {
      try {
        result = await (routedModel!.provider === 'gemini' ? handleGeminiChat(deps, chatInput) : handleGroqChat(deps, chatInput));
        this.markProviderSuccess(routedModel!.provider);
      } catch (err: any) {
        this.markProviderFailure(routedModel!.provider);
        if (!image) {
          const fallbackModel = this.getAlternateModel(routedModel!, `${routedModel!.provider} failed; retried with fallback provider`);
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
          recoveredFallbackReason = `${routedModel!.provider} failed; recovered with ${fallbackModel.provider}`;
        } else {
          throw err;
        }
      }
    } catch (err: any) {
      aiError = err?.message || 'Unknown error';
      throw err;
    } finally {
      const requestLog = appendRequestLog({
        type: 'chat',
        source,
        intent: intentRoute!.intent,
        prompt: userMessage,
        normalizedPrompt: normalizedPrompt!,
        skill: skill.name,
        model: routedModel!.provider,
        routeReason: intentRoute!.reason,
        routeConfidence: intentRoute!.confidence,
        modelChoiceReason: routedModel!.reason,
        toolsCalled: combinedTools.map((t: any) => t.function?.name).filter(Boolean),
        ragSnippetCount: skillContext!.ragSources?.length ?? 0,
        ragQuery: skillContext!.ragQuery,
        ragMiss: skillContext!.ragMiss,
        ragSources: skillContext!.ragSources,
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
        resolvedFamilyMode: skillContext!.resolvedFamilyMode,
      });
      requestLogId = requestLog.id;
      this.recordRoutingCase(userMessage, intentRoute!, skill.name, aiError ? 'model_error' : 'model_success', aiError);
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

    setSessionCachedResponse(cacheKey!, result, intentRoute!.intent);

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
    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);
    const pipeline = await this.executeEarlyReturnPipeline(familyId, userMessage, userIds, sessionId, modelSelection, image, source, 'stream', res);
    if (pipeline.handled) return pipeline.result;

    const { targetUserId, intentRoute, normalizedPrompt, routedModel, cacheKey, skill, knowledgeSkill, skillContext, trace } = pipeline;
    const debugState: {
      resolverTelemetry?: Record<string, unknown>;
      proposedAction?: Record<string, unknown>;
      sanitizerIncidents: Array<Record<string, unknown>>;
      needsClarification: boolean;
    } = {
      sanitizerIncidents: [],
      needsClarification: false,
    };

    const { deps, combinedTools, safeMessage, hits } = this.setupModelDepsAndTools(
      routedModel!,
      skill,
      knowledgeSkill,
      skillContext!,
      userMessage,
      intentRoute!,
      debugState,
    );

    const basePromptStream = this.composePrompt(skillContext!, skill.getSystemPrompt(skillContext!));
    const wordCountStream = (userMessage || '').trim().split(/\s+/).filter(Boolean).length;
    const systemPromptOverrideStream = wordCountStream > 10
      ? `${basePromptStream}\n\n[CHAIN_OF_THOUGHT RULE]\nBạn BẮT BUỘC phải suy nghĩ từng bước trước khi bắt đầu trả lời hoặc gọi công cụ. Viết toàn bộ suy nghĩ (reasoning steps/thought process) của bạn bằng tiếng Việt bên trong cặp thẻ <thought>...</thought> ở ngay đầu câu trả lời (Ví dụ: <thought>Phân tích câu hỏi... Xác định tool...</thought>). Thẻ này phải nằm trên cùng và bao quanh toàn bộ logic suy nghĩ của bạn. Không được bỏ qua thẻ này.`
      : basePromptStream;

    const streamInput = buildAiModelInput({
      familyId,
      skillContext: skillContext!,
      finalUserMessage: safeMessage,
      userId: targetUserId || '',
      intentRoute: intentRoute!,
      sessionId,
      trace: trace!,
      res,
      image,
      systemPromptOverride: systemPromptOverrideStream,
      toolsOverride: combinedTools,
    });

    const t1 = Date.now();
    let streamError: string | undefined;
    const requestLog = appendRequestLog({
      type: 'stream',
      source,
      intent: intentRoute!.intent,
      prompt: userMessage,
      normalizedPrompt: normalizedPrompt!,
      skill: skill.name,
      model: routedModel!.provider,
      routeReason: intentRoute!.reason,
      routeConfidence: intentRoute!.confidence,
      modelChoiceReason: routedModel!.reason,
      toolsCalled: combinedTools.map((t: any) => t.function?.name).filter(Boolean),
      ragSnippetCount: skillContext!.ragSources?.length ?? 0,
      ragQuery: skillContext!.ragQuery,
      ragMiss: skillContext!.ragMiss,
      ragSources: skillContext!.ragSources,
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
      resolvedFamilyMode: skillContext!.resolvedFamilyMode,
    });
    res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
    try {
      if (routedModel!.provider === 'gemini') {
        await handleGeminiStream(deps, streamInput);
      } else {
        await handleGroqStream(deps, streamInput);
      }
      this.markProviderSuccess(routedModel!.provider);
    } catch (err: any) {
      streamError = err?.message || 'Unknown error';
      this.markProviderFailure(routedModel!.provider);
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
        source,
        prompt: userMessage,
        normalizedPrompt: normalizedPrompt!,
        routeReason: intentRoute!.reason,
        routeConfidence: intentRoute!.confidence,
        modelChoiceReason: routedModel!.reason,
        toolsCalled: combinedTools.map((t: any) => t.function?.name).filter(Boolean),
        ragSnippetCount: skillContext!.ragSources?.length ?? 0,
        ragQuery: skillContext!.ragQuery,
        ragMiss: skillContext!.ragMiss,
        ragSources: skillContext!.ragSources,
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
      this.recordRoutingCase(userMessage, intentRoute!, skill.name, streamError ? 'model_error' : 'model_success', streamError);
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
    const telemetry = await getAiRequestTelemetry(filters);

    return {
      cache: getSessionCacheStats(),
      logStats: telemetry.logStats,
      routingConfusions: {
        stats: getConfusionStats(),
        recent: getConfusionCases(10),
      },
      feedback: telemetry.feedbackStats,
      recentLogs: telemetry.logs,
      topRagSources: telemetry.topRetrievedRagSources,
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

  async createEvalDraftFromLog(input: {
    requestLogId: string;
    group?: string;
    expectedIntent?: string;
    expectedSkill?: string;
    expectedFamilyId?: string;
    note?: string;
  }) {
    if (!input.requestLogId) return { ok: false, error: 'requestLogId is required' };

    // Try to find from DB first, then in-memory buffer
    let log: any = null;
    if (this.prisma.aiRequestLog) {
      try {
        log = await this.prisma.aiRequestLog.findUnique({
          where: { id: input.requestLogId },
          include: { feedbacks: { orderBy: { createdAt: 'asc' } } },
        });
      } catch {
        // fall through to in-memory
      }
    }

    if (!log) {
      return { ok: false, error: 'Request log not found. It may have expired from the in-memory buffer.' };
    }

    try {
      const evalCase = await this.prisma.aiEvalCase.create({
        data: {
          input: log.prompt || '',
          expectedIntent: input.expectedIntent || log.intent || null,
          expectedSkill: input.expectedSkill || log.skill || null,
          expectedTool: log.toolsCalled?.[0] || null,
          sourceLogId: log.id,
          status: 'ACTIVE',
        },
      });

      this.logger.log(`[EvalDraft] Created active eval case ${evalCase.id} from request log ${input.requestLogId}`);
      return { ok: true, evalCase };
    } catch (err: any) {
      this.logger.error(`Failed to save eval case to database: ${err.message}`, err);
      return { ok: false, error: `Database save failed: ${err.message}` };
    }
  }

  async getEvalCases() {
    return this.prisma.aiEvalCase.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async runEvalCases() {
    const cases = await this.prisma.aiEvalCase.findMany({
      where: { status: 'ACTIVE' },
    });

    const results = [];
    let passCount = 0;
    let failCount = 0;

    for (const testCase of cases) {
      const actualIntent = classifyAiIntent(testCase.input, false);
      const skillByIntent: Record<string, string> = {
        image_vision: 'VisionSkill',
        gold_price: 'MarketSkill',
        horoscope: 'HoroscopeSkill',
        calendar_query: 'CalendarSkill',
        event_mutation: 'CalendarSkill',
        football: 'FootballSkill',
        weather: 'WeatherSkill',
        family_knowledge: 'FamilyKnowledgeSkill',
        meal_suggestion: 'MealSkill',
        web_search: 'SearchSkill',
        general_chat: 'GeneralChatSkill',
      };
      
      const skill = skillByIntent[actualIntent.intent];
      const errors: string[] = [];

      if (testCase.expectedIntent && actualIntent.intent !== testCase.expectedIntent) {
        errors.push(`Expected intent ${testCase.expectedIntent}, got ${actualIntent.intent}`);
      }

      if (testCase.expectedSkill && skill !== testCase.expectedSkill) {
        errors.push(`Expected skill ${testCase.expectedSkill}, got ${skill}`);
      }

      const passed = errors.length === 0;
      if (passed) passCount++;
      else failCount++;

      results.push({
        id: testCase.id,
        input: testCase.input,
        expectedIntent: testCase.expectedIntent,
        expectedSkill: testCase.expectedSkill,
        actualIntent: actualIntent.intent,
        actualSkill: skill,
        passed,
        errors,
      });
    }

    return {
      passCount,
      failCount,
      results,
    };
  }

  async updateEvalCase(id: string, data: any) {
    return this.prisma.aiEvalCase.update({
      where: { id },
      data,
    });
  }

  async deleteEvalCase(id: string) {
    return this.prisma.aiEvalCase.delete({
      where: { id },
    });
  }

  async generateBriefingText(systemPrompt: string, userPrompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.groqModel,
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
        const model = this.gemini.getGenerativeModel({
          model: this.geminiModel,
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
