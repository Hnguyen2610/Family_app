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
import { routeAiModel } from '../ai-model-routing';
import { AiSkillRegistry } from '../skills/ai-skill-registry';
import { AiSkillContext } from '../interfaces/ai-skill.interface';
import { buildSystemPrompt } from '../ai-agent-prompt';
import { redactSensitiveData } from '../ai-redact';
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
  shouldAllowKnowledgeWriteTool,
  shouldAllowSideEffectTool,
} from '../ai-tool-policy';

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

  constructor(
    private readonly chatService: ChatService,
    private readonly prisma: PrismaService,
    private readonly skillRegistry: AiSkillRegistry,
    private readonly horoscopeService: HoroscopeService,
    private readonly familyResolver: AiFamilyResolver,
    private readonly structuredActionHandler: AiStructuredActionHandler,
    private readonly actionProposalService: AiActionProposalService,
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

  private getModelHandlerDeps(modelOverride?: { groqModel?: string; geminiModel?: string }) {
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

  private isActionProposalResult(value: any) {
    return value?.type === 'action_proposal' && value?.proposalId;
  }

  private getDirectResultContent(value: any) {
    if (this.isActionProposalResult(value)) {
      return value.message || 'Mình đã chuẩn bị thao tác này. Bạn xác nhận trước khi lưu nhé.';
    }
    return String(value || '');
  }

  private getDirectResultProposal(value: any) {
    return this.isActionProposalResult(value) ? value : undefined;
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

  async chat(
    familyId: string,
    userMessage: string,
    userIds: string[] = [],
    image?: string,
    modelSelection?: string,
    sessionId?: string,
    source: 'web' | 'telegram' = 'web',
  ) {
    const trace = createAiTrace('chat', modelSelection || 'groq');

    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);

    const targetUserId = getPrimaryUserId(userIds);
    const intentRoute = await this.classifyIntentWithFallback(userMessage, !!image);

    // Low-confidence gate: ask user to clarify rather than guess
    if (this.needsClarificationResponse(intentRoute, userMessage)) {
      const clarificationMsg = 'MÃ¬nh chÆ°a hiá»ƒu rÃµ Ã½ báº¡n láº¯m. Báº¡n cÃ³ thá»ƒ nÃ³i rÃµ hÆ¡n khÃ´ng? Ã báº¡n Ä‘ang há»i vá» lá»‹ch, bÃ³ng Ä‘Ã¡, sá»• tay gia Ä‘Ã¬nh, hay Ä‘iá»u gÃ¬ khÃ¡c? ðŸ™';
      await this.chatService.saveMessage(familyId, 'assistant', clarificationMsg, sessionId);
      const requestLog = appendDirectAiRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { content: clarificationMsg, familyId, cached: false, direct: true, requestLogId: requestLog.id };
    }

    const routedModel = routeAiModel(modelSelection, intentRoute);

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
    if (cached) {
      await this.chatService.saveMessage(familyId, 'assistant', cached.content, sessionId);
      const requestLog = appendDirectAiRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        model: routedModel.provider,
        cached: true,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { ...cached, cached: true, requestLogId: requestLog.id };
    }

    const skill = this.skillRegistry.getSkillForIntent(intentRoute.intent as any);
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
    const knowledgeSkill = this.skillRegistry.getAllSkills().find(s => s.name === 'FamilyKnowledgeSkill');

    const directStructuredAction = await this.structuredActionHandler.tryHandleStructuredMemoryEvent(skill, knowledgeSkill, skillContext);
    if (directStructuredAction) {
      const content = this.getDirectResultContent(directStructuredAction);
      await this.chatService.saveMessage(familyId, 'assistant', content, sessionId);
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_structured_memory_event');
      const requestLog = appendDirectAiRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        skill: skill.name,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { content, familyId, cached: false, direct: true, requestLogId: requestLog.id, proposal: this.getDirectResultProposal(directStructuredAction) };
    }

    const directCalendarMutation = await this.structuredActionHandler.tryHandleStructuredCalendarMutation(skill, skillContext);
    if (directCalendarMutation) {
      const content = this.getDirectResultContent(directCalendarMutation);
      await this.chatService.saveMessage(familyId, 'assistant', content, sessionId);
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_calendar_mutation');
      const requestLog = appendDirectAiRequestLog({
        type: 'chat',
        intent: intentRoute.intent,
        skill: skill.name,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      return { content, familyId, cached: false, direct: true, requestLogId: requestLog.id, proposal: this.getDirectResultProposal(directCalendarMutation) };
    }

    // Direct answer
    if (skill.tryDirectAnswer) {
      const direct = await skill.tryDirectAnswer(skillContext);
      if (direct) {
        await this.chatService.saveMessage(familyId, 'assistant', direct.content, sessionId);
        setSessionCachedResponse(cacheKey, { content: direct.content, familyId }, intentRoute.intent);
        this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_answer');
        const requestLog = appendDirectAiRequestLog({
          type: 'chat',
          intent: intentRoute.intent,
          skill: skill.name,
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

    const allowKnowledgeWrite = shouldAllowKnowledgeWriteTool(skillContext);
    const skillTools = getSkillToolsForContext(skill, skillContext);
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
      shouldAllowSideEffectTool: (name) => shouldAllowSideEffectTool(name, skillContext),
      createActionProposal: (toolName, args, context) => this.actionProposalService.createToolProposal(toolName, args, context),
    });

    const chatInput = buildAiModelInput({
      familyId,
      skillContext,
      finalUserMessage: safeMessage,
      userId: targetUserId,
      intentRoute,
      sessionId,
      trace,
      image,
      systemPromptOverride: this.composePrompt(skillContext, skill.getSystemPrompt(skillContext)),
      toolsOverride: combinedTools,
    });

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

    setSessionCachedResponse(cacheKey, result, intentRoute.intent);

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

  async chatStream(
    familyId: string,
    userMessage: string,
    userIds: string[],
    res: any,
    sessionId?: string,
    image?: string,
    modelSelection?: string,
    source: 'web' | 'telegram' = 'web',
  ) {
    const trace = createAiTrace('stream', modelSelection || 'groq', res);


    await this.chatService.saveMessage(familyId, 'user', userMessage, sessionId);

    const targetUserId = getPrimaryUserId(userIds);
    const intentRoute = await this.classifyIntentWithFallback(userMessage, !!image);

    // Low-confidence gate: ask user to clarify rather than guess
    if (this.needsClarificationResponse(intentRoute, userMessage)) {
      const clarificationMsg = 'Mình chưa hiểu rõ ý bạn lắm. Bạn có thể nói rõ hơn không? Ý bạn đang hỏi về lịch, bóng đá, sổ tay gia đình, hay điều gì khác? 🙏';
      await this.chatService.saveMessage(familyId, 'assistant', clarificationMsg, sessionId);
      const requestLog = appendDirectAiRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
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
    const cacheKey = buildSessionCacheKey({
      familyId,
      userId: targetUserId,
      model: routedModel.provider,
      userMessage,
      intentRoute,
      hasImage: !!image,
    });
    const cached = getSessionCachedResponse(cacheKey);

    res.write(`data: ${JSON.stringify({ type: 'status', status: image ? 'uploading_image' : 'generating_answer' })}\n\n`);

    if (cached) {
      const requestLog = appendDirectAiRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        model: routedModel.provider,
        cached: true,
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
    const knowledgeSkill = this.skillRegistry.getAllSkills().find(s => s.name === 'FamilyKnowledgeSkill');

    const directStructuredAction = await this.structuredActionHandler.tryHandleStructuredMemoryEvent(skill, knowledgeSkill, skillContext);
    if (directStructuredAction) {
      const content = this.getDirectResultContent(directStructuredAction);
      const proposal = this.getDirectResultProposal(directStructuredAction);
      await this.chatService.saveMessage(familyId, 'assistant', content, sessionId);
      const requestLog = appendDirectAiRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        skill: skill.name,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
      if (proposal) res.write(`data: ${JSON.stringify({ type: 'action_proposal', proposal })}\n\n`);
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      this.recordRoutingCase(userMessage, intentRoute, skill.name, 'direct_structured_memory_event');
      return;
    }

    const directCalendarMutation = await this.structuredActionHandler.tryHandleStructuredCalendarMutation(skill, skillContext);
    if (directCalendarMutation) {
      const content = this.getDirectResultContent(directCalendarMutation);
      const proposal = this.getDirectResultProposal(directCalendarMutation);
      await this.chatService.saveMessage(familyId, 'assistant', content, sessionId);
      const requestLog = appendDirectAiRequestLog({
        type: 'stream',
        intent: intentRoute.intent,
        skill: skill.name,
        userId: targetUserId || undefined,
        familyId,
        sessionId,
      });
      res.write(`data: ${JSON.stringify({ type: 'request_log_id', requestLogId: requestLog.id })}\n\n`);
      if (proposal) res.write(`data: ${JSON.stringify({ type: 'action_proposal', proposal })}\n\n`);
      res.write(`data: ${JSON.stringify({ content })}\n\n`);
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
        setSessionCachedResponse(cacheKey, { content: direct.content, familyId }, intentRoute.intent);
        const requestLog = appendDirectAiRequestLog({
          type: 'stream',
          intent: intentRoute.intent,
          skill: skill.name,
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

    const allowKnowledgeWrite = shouldAllowKnowledgeWriteTool(skillContext);
    const skillTools = getSkillToolsForContext(skill, skillContext);
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
      shouldAllowSideEffectTool: (name) => shouldAllowSideEffectTool(name, skillContext),
      createActionProposal: (toolName, args, context) => this.actionProposalService.createToolProposal(toolName, args, context),
    });

    const streamInput = buildAiModelInput({
      familyId,
      skillContext,
      finalUserMessage: safeStreamMessage,
      userId: targetUserId,
      intentRoute,
      sessionId,
      trace,
      res,
      image,
      systemPromptOverride: this.composePrompt(skillContext, skill.getSystemPrompt(skillContext)),
      toolsOverride: combinedTools,
    });

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
}
