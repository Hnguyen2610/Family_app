import { Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './services/chat.service';
import { buildSystemPrompt } from './ai-agent-prompt';
import { getTools, getGeminiTools } from './ai-agent-tools';
import { AiIntentRoute } from './ai-intent-router';
import { AiTrace, measureAiStep } from './ai-observability';
import { sanitizeAiResponse } from './ai-response-sanitizer';
import { DEFAULT_GROQ_TOOL_MODEL } from './ai-model-defaults';
import { buildUsageSnapshot, parseGroqRateLimitQuota, unavailableQuota } from './ai-usage';

export interface ModelHandlerDeps {
  logger: Logger;
  openai: OpenAI;
  gemini: GoogleGenerativeAI;
  chatService: ChatService;
  groqModel: string;
  geminiModel: string;
  aiMaxTokens: number;
  groqContextWindow: number;
  geminiContextWindow: number;
  historyLimit: number;
  executeTool: (toolName: string, args: any, familyId: string, userId: string, trace?: any) => Promise<any>;
  onSanitizerIncident?: (incident: Record<string, unknown>) => void;
  decorateAssistantContent?: (content: string) => string;
}

export interface ChatHandlerInput {
  familyId: string;
  history: any[];
  familyInfo: string;
  finalUserMessage: string;
  userId: string;
  intentRoute: AiIntentRoute;
  sessionId?: string;
  trace?: AiTrace;
  systemPromptOverride?: string;
  dynamicSuffix?: string;
  toolsOverride?: any[];
  image?: string;
  responseSchema?: any;
}

export interface StreamHandlerInput extends ChatHandlerInput {
  res: any;
  accumulatedContent?: string;
}

function buildPromptText(familyInfo: string, history: any[], userMessage: string, override?: string, dynamicSuffix?: string) {
  return `${override || buildSystemPrompt(familyInfo)}\n\nHistory: ${JSON.stringify(history)}\n\n${dynamicSuffix ? `${dynamicSuffix}\n\n` : ''}User: ${userMessage}`;
}

function isActionProposalResult(value: any) {
  return value?.type === 'action_proposal' && value?.proposalId;
}

function getActionProposalContent(value: any) {
  if (value?.summary) return `${value.summary}\n\nBạn xác nhận trước khi lưu nhé.`;
  return value?.message || 'Mình đã chuẩn bị thao tác này. Bạn xác nhận trước khi lưu nhé.';
}

async function returnActionProposalChat(deps: ModelHandlerDeps, input: ChatHandlerInput, proposal: any, usage: any) {
  const baseContent = getActionProposalContent(proposal);
  const content = `${baseContent}\n<!-- action_proposal:${proposal.proposalId} -->`;
  await deps.chatService.saveMessage(input.familyId, 'assistant', content, input.sessionId);
  return {
    content,
    familyId: input.familyId,
    proposal,
    usage,
  };
}

function writeActionProposalStream(res: any, proposal: any, usage?: any) {
  const content = getActionProposalContent(proposal);
  res.write(`data: ${JSON.stringify({ type: 'action_proposal', proposal })}\n\n`);
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
  if (usage) res.write(`data: ${JSON.stringify({ type: 'usage', usage })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
}

function stripPseudoFunctionTags(content: string) {
  return content
    .replace(/<function[=:][\s\S]*?<\/function>/g, '')
    .replace(/<function[=:][^>]*>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseAttributeArgs(text: string) {
  const args: Record<string, any> = {};
  const argPattern = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g;
  let match: RegExpExecArray | null;
  while ((match = argPattern.exec(text)) !== null) {
    args[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return args;
}

function parsePseudoFunctionCalls(content: string) {
  const calls: Array<{ name: string; args: any }> = [];
  const tagPattern = /<function([=:][^>]*)>/g;
  let tag: RegExpExecArray | null;

  while ((tag = tagPattern.exec(content)) !== null) {
    const raw = tag[1].trim().replace(/\/$/, '').trim();
    let name = '';
    let argsText = '';
    let args: any = {};

    if (raw.startsWith('=')) {
      const expression = raw.slice(1).trim();
      const call = expression.match(/^(\w+)\s*\(([\s\S]*)\)$/);
      if (call) {
        name = call[1];
        argsText = call[2].trim();
      }
    } else if (raw.startsWith(':')) {
      const rest = raw.slice(1).trim();
      const named = rest.match(/^(\w+)\b([\s\S]*)$/);
      if (named) {
        name = named[1];
        argsText = named[2].trim();
      }

      const closeIndex = content.indexOf('</function>', tagPattern.lastIndex);
      if (closeIndex >= 0) {
        const body = content.slice(tagPattern.lastIndex, closeIndex).trim();
        if (body) argsText = body;
        tagPattern.lastIndex = closeIndex + '</function>'.length;
      }
    }

    if (!name) continue;

    if (argsText.startsWith('{')) {
      try {
        args = JSON.parse(argsText);
      } catch {
        args = {};
      }
    } else {
      args = parseAttributeArgs(argsText);
    }

    calls.push({ name, args });
  }

  return calls;
}

async function executePseudoFunctionCalls(content: string, deps: ModelHandlerDeps, input: ChatHandlerInput) {
  const calls = parsePseudoFunctionCalls(content);
  for (const call of calls) {
    await deps.executeTool(call.name, call.args, input.familyId, input.userId, input.trace);
  }
  return calls.length;
}

// Gemini passes tool-call args as a parsed object; Groq passes them as an already-serialized
// JSON string. Both need the same key shape to dedupe against the same `calledCalls` Set, so
// stringify only when needed rather than duplicating this ternary at all 4 call sites below.
function buildToolCallKey(name: string, args: unknown): string {
  return `${name}:${typeof args === 'string' ? args : JSON.stringify(args)}`;
}

function isRetryableGeminiError(error: any): boolean {
  const status = error?.status;
  const message = String(error?.message || error || '').toLowerCase();
  return status === 429 || status === 500 || status === 503 || message.includes('high demand');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withGeminiRetry<T>(
  operation: () => Promise<T>,
  logger: Logger,
  label: string
): Promise<T> {
  const delays = [600, 1400];
  let lastError: any;

  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (!isRetryableGeminiError(error) || attempt === delays.length) break;
      logger.warn(`${label} failed with retryable Gemini error; retrying attempt ${attempt + 2}`);
      await sleep(delays[attempt]);
    }
  }

  throw lastError;
}

function getGeminiVisionBusyMessage() {
  return 'Gemini vision đang quá tải tạm thời nên chưa đọc được ảnh lúc này. Bạn thử gửi lại sau vài giây, hoặc chọn ảnh nhỏ hơn/lớn hơn nhe.';
}

async function runCriticAudit(content: string, _deps: ModelHandlerDeps): Promise<string> {
  // Fast regex-based sanitization is already handled by sanitizeAiResponse (1ms).
  // Bypassing the redundant secondary LLM Critic call saves 2-3 seconds of latency per turn.
  return content;
}

async function sanitizeFinalAssistantContent(content: string, deps: ModelHandlerDeps, context: string, res?: any) {
  let sanitizedContent = content;
  const sanitized = sanitizeAiResponse(content);
  if (sanitized.sanitized) {
    deps.logger.warn(`[ResponseSanitizer] ${context}: ${sanitized.reasons.join(', ')}`);
    deps.onSanitizerIncident?.({
      stage: context,
      reasons: sanitized.reasons,
      blocked: true,
    });
    sanitizedContent = sanitized.content;
  }

  const auditedContent = await runCriticAudit(sanitizedContent, deps);

  if (auditedContent !== content && res) {
    res.write(`data: ${JSON.stringify({ type: 'replace_content', content: auditedContent })}\n\n`);
  }
  return auditedContent;
}

function decorateFinalAssistantContent(content: string, deps: ModelHandlerDeps, res?: any) {
  const decorated = deps.decorateAssistantContent ? deps.decorateAssistantContent(content) : content;
  if (decorated !== content && res) {
    res.write(`data: ${JSON.stringify({ type: 'replace_content', content: decorated })}\n\n`);
  }
  return decorated;
}

export async function handleGeminiChat(deps: ModelHandlerDeps, input: ChatHandlerInput) {
  const { gemini, chatService, logger, executeTool, geminiModel, geminiContextWindow, aiMaxTokens, historyLimit } = deps;
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, systemPromptOverride, dynamicSuffix, toolsOverride, image } = input;

  const systemPrompt = systemPromptOverride || buildSystemPrompt(familyInfo);
  const tools = toolsOverride ?
    [{ functionDeclarations: toolsOverride.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }] :
    getGeminiTools();

  const genModel = gemini.getGenerativeModel({
    model: geminiModel,
    systemInstruction: systemPrompt,
    tools,
    ...(input.responseSchema ? {
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: input.responseSchema,
      }
    } : {}),
  });

  const geminiHistory = [...history].reverse()
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    .filter((m, i) => !(i === 0 && m.role === 'model'));

  const chat = genModel.startChat({ history: geminiHistory });

  const applyDynamicSuffix = (text: string) => dynamicSuffix ? `${dynamicSuffix}\n\n${text}` : text;

  let currentInput: any;
  if (image) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (match) {
      const imageCaption = finalUserMessage || 'Phân tích và mô tả chi tiết hình ảnh này.';
      currentInput = [
        { text: applyDynamicSuffix(imageCaption) },
        { inlineData: { data: match[2].replace(/\s/g, ''), mimeType: match[1] } }
      ];
    } else {
      currentInput = applyDynamicSuffix(finalUserMessage);
    }
  } else {
    currentInput = applyDynamicSuffix(finalUserMessage);
  }

  let assistantContent = '';
  let loopCount = 0;
  let apiUsage: any;
  const calledCalls = new Set<string>();

  while (loopCount < 5) {
    let result: any;
    try {
      result = await measureAiStep(
        logger,
        'model_call',
        trace,
        { provider: 'gemini', phase: 'chat_loop', loop: loopCount + 1 },
        () => withGeminiRetry(() => chat.sendMessage(currentInput), logger, 'Gemini chat')
      );
    } catch (error) {
      if (image) {
        assistantContent = getGeminiVisionBusyMessage();
        break;
      }
      throw error;
    }
    const part = result.response.candidates?.[0]?.content?.parts?.[0];

    if (part?.functionCall) {
      loopCount++;
      const callCheck = buildToolCallKey(part.functionCall.name, part.functionCall.args);
      if (calledCalls.has(callCheck)) {
        currentInput = [{ functionResponse: { name: part.functionCall.name, response: { error: 'Already searched. Use previous info.' } } }];
      } else {
        calledCalls.add(callCheck);
        const res = await executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, trace);
        if (isActionProposalResult(res)) {
          const usage = buildUsageSnapshot({
            provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
            historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
            completionText: getActionProposalContent(res), apiUsage: result.response.usageMetadata,
            quota: unavailableQuota('Gemini API does not expose quota.'),
          });
          return returnActionProposalChat(deps, input, res, usage);
        }
        currentInput = [{ functionResponse: { name: part.functionCall.name, response: res } }];
      }
    } else {
      apiUsage = result.response.usageMetadata;
      assistantContent = result.response.text();
      break;
    }
  }

  assistantContent = decorateFinalAssistantContent(assistantContent, deps);
  assistantContent = await sanitizeFinalAssistantContent(assistantContent, deps, 'gemini_chat');
  const usage = buildUsageSnapshot({
    provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
    historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
    completionText: assistantContent, apiUsage, quota: unavailableQuota('Gemini API does not expose quota.'),
  });

  await chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  return { content: assistantContent, familyId, usage };
}

export async function handleGroqChat(deps: ModelHandlerDeps, input: ChatHandlerInput) {
  const { openai, chatService, groqModel, aiMaxTokens, groqContextWindow, historyLimit, logger, executeTool } = deps;
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, systemPromptOverride, dynamicSuffix, toolsOverride } = input;

  const systemPrompt = [systemPromptOverride || buildSystemPrompt(familyInfo), dynamicSuffix].filter(Boolean).join('\n\n');
  const messages = [
    { role: 'system', content: systemPrompt },
    ...[...history].reverse().map(m => ({ role: m.role as any, content: m.content })),
    { role: 'user', content: finalUserMessage },
  ];
  const tools = toolsOverride || getTools();

  let loopCount = 0;
  let assistantContent = '';
  const calledCalls = new Set<string>();
  let quota: any;
  let apiUsage: any;

  while (loopCount < 5) {
    const result = await measureAiStep(logger, 'model_call', trace, { provider: 'groq', phase: 'chat_loop', loop: loopCount + 1 }, () => openai.chat.completions.create({
      model: groqModel,
      messages,
      max_tokens: Math.min(aiMaxTokens, 1800),
      tools: tools as any,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    }).withResponse());

    const response = result.data;
    quota = parseGroqRateLimitQuota(result.response.headers);
    const msg = response.choices[0].message;
    if (response.usage) apiUsage = response.usage;

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      loopCount++;
      messages.push(msg as any);

      let toolExecuted = false;
      let loopGuardTriggered = false;
      for (const tc of msg.tool_calls) {
        let toolName = tc.function.name;
        if (toolName.includes('{')) {
          toolName = toolName.substring(0, toolName.indexOf('{')).trim();
        }

        const callCheck = buildToolCallKey(toolName, tc.function.arguments);
        if (calledCalls.has(callCheck)) {
          logger.warn(`[LoopGuard] Groq Chat AI is repeating tool call: ${callCheck}. Forcing response.`);
          messages.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: JSON.stringify({ error: 'You have already performed this exact tool call. Use previous results or reply directly.' }),
          } as any);
          loopGuardTriggered = true;
          break;
        }

        calledCalls.add(callCheck);
        const res = await executeTool(toolName, JSON.parse(tc.function.arguments), familyId, userId, trace);
        if (isActionProposalResult(res)) {
          const usage = buildUsageSnapshot({
            provider: 'groq', model: groqModel, contextWindow: groqContextWindow, maxOutputTokens: aiMaxTokens,
            historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
            completionText: getActionProposalContent(res), apiUsage, quota,
          });
          return returnActionProposalChat(deps, input, res, usage);
        }

        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) } as any);
        toolExecuted = true;
      }

      if (loopGuardTriggered || !toolExecuted) {
        break;
      }
    } else {
      assistantContent = msg.content || '';
      break;
    }
  }

  if (assistantContent.includes('<function')) {
    const pseudoCount = await executePseudoFunctionCalls(assistantContent, deps, input);
    if (pseudoCount > 0) {
      assistantContent = stripPseudoFunctionTags(assistantContent);
    }
  }

  assistantContent = decorateFinalAssistantContent(assistantContent, deps);
  assistantContent = await sanitizeFinalAssistantContent(assistantContent, deps, 'groq_chat');
  const usage = buildUsageSnapshot({
    provider: 'groq', model: groqModel, contextWindow: groqContextWindow, maxOutputTokens: aiMaxTokens, historyLimit,
    promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
    completionText: assistantContent, apiUsage, quota,
  });

  await chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  return { content: assistantContent, familyId, usage };
}

export async function handleGeminiStream(deps: ModelHandlerDeps, input: StreamHandlerInput) {
  const { gemini, chatService, executeTool, geminiModel, geminiContextWindow, aiMaxTokens, historyLimit } = deps;
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, res, systemPromptOverride, dynamicSuffix, toolsOverride, image } = input;

  const systemPrompt = systemPromptOverride || buildSystemPrompt(familyInfo);
  const tools = toolsOverride ?
    [{ functionDeclarations: toolsOverride.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }] :
    getGeminiTools();

  const genModel = gemini.getGenerativeModel({ model: geminiModel, systemInstruction: systemPrompt, tools });
  const geminiHistory = [...history].reverse()
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    .filter((m, i) => !(i === 0 && m.role === 'model'));

  const chat = genModel.startChat({ history: geminiHistory });

  const applyDynamicSuffix = (text: string) => dynamicSuffix ? `${dynamicSuffix}\n\n${text}` : text;

  let currentInput: any;
  if (image) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (match) {
      const imageCaption = finalUserMessage || 'Phân tích và mô tả chi tiết hình ảnh này.';
      currentInput = [
        { text: applyDynamicSuffix(imageCaption) },
        { inlineData: { data: match[2].replace(/\s/g, ''), mimeType: match[1] } }
      ];
    } else {
      currentInput = applyDynamicSuffix(finalUserMessage);
    }
  } else {
    currentInput = applyDynamicSuffix(finalUserMessage);
  }

  let assistantContent = '';
  let loopCount = 0;
  let apiUsage: any;

  const calledCalls = new Set<string>();
  while (loopCount < 5) {
    let result: any;
    try {
      if (image && loopCount === 0) {
        res.write(`data: ${JSON.stringify({ type: 'status', status: 'gemini_reading_image' })}\n\n`);
      }
      result = await withGeminiRetry(
        () => chat.sendMessageStream(currentInput),
        deps.logger,
        'Gemini stream'
      );
    } catch (error) {
      if (image) {
        assistantContent = getGeminiVisionBusyMessage();
        res.write(`data: ${JSON.stringify({ content: assistantContent })}\n\n`);
        break;
      }
      throw error;
    }
    let isTool = false;
    let loopGuardBreak = false;
    for await (const chunk of result.stream) {
      const part = chunk.candidates?.[0]?.content?.parts?.[0];
      if (part?.functionCall) {
        isTool = true;
        const callCheck = buildToolCallKey(part.functionCall.name, part.functionCall.args);
        if (calledCalls.has(callCheck)) {
          deps.logger.warn(`[LoopGuard] AI is repeating tool call: ${callCheck}. Forcing response.`);
          loopGuardBreak = true;
        } else {
          calledCalls.add(callCheck);
          const toolRes = await executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, trace);
          if (isActionProposalResult(toolRes)) {
            const usage = buildUsageSnapshot({
              provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
              historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
              completionText: getActionProposalContent(toolRes), apiUsage,
              quota: unavailableQuota('Gemini API does not expose quota.'),
            });
            const proposalContent = `${getActionProposalContent(toolRes)}\n<!-- action_proposal:${toolRes.proposalId} -->`;
            await chatService.saveMessage(familyId, 'assistant', proposalContent, sessionId);
            writeActionProposalStream(res, toolRes, usage);
            return;
          }
          currentInput = [{ functionResponse: { name: part.functionCall.name, response: toolRes } }];
        }
        break;
      }
      try {
        const text = chunk.text();
        assistantContent += text;
        input.accumulatedContent = assistantContent;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        if (chunk.usageMetadata) apiUsage = chunk.usageMetadata;
      } catch (e) {
        // Handle blocked content or non-text chunks
        continue;
      }
    }
    if (!isTool || loopGuardBreak) break;
    loopCount++;
  }

  if (assistantContent.includes('<function')) {
    const pseudoCount = await executePseudoFunctionCalls(assistantContent, deps, input);
    if (pseudoCount > 0) {
      assistantContent = stripPseudoFunctionTags(assistantContent);
      res.write(`data: ${JSON.stringify({ type: 'replace_content', content: assistantContent })}\n\n`);
    }
  }

  assistantContent = decorateFinalAssistantContent(assistantContent, deps, res);
  assistantContent = await sanitizeFinalAssistantContent(assistantContent, deps, 'gemini_stream', res);
  const usage = buildUsageSnapshot({
    provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
    historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
    completionText: assistantContent, apiUsage, quota: unavailableQuota('Gemini API does not expose stream quota.'),
  });

  res.write(`data: ${JSON.stringify({ type: 'usage', usage })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
  await chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  return { content: assistantContent, familyId, usage };
}

export async function handleGroqStream(deps: ModelHandlerDeps, input: StreamHandlerInput) {
  const { openai, chatService, groqModel, logger, executeTool, aiMaxTokens, groqContextWindow, historyLimit } = deps;
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, res, systemPromptOverride, dynamicSuffix, toolsOverride } = input;

  const systemPrompt = [systemPromptOverride || buildSystemPrompt(familyInfo), dynamicSuffix].filter(Boolean).join('\n\n');
  const messages = [
    { role: 'system', content: systemPrompt },
    ...[...history].reverse().map(m => ({ role: m.role as any, content: m.content })),
    { role: 'user', content: finalUserMessage },
  ];
  const tools = toolsOverride || getTools();

  let loopCount = 0;
  let assistantContent = '';
  const calledCalls = new Set<string>();
  let quota: any;
  let apiUsage: any;

  while (loopCount < 5) {
    const streamResponse = await measureAiStep(logger, 'model_call', trace, { provider: 'groq', phase: 'stream_loop', loop: loopCount + 1 }, () => openai.chat.completions.create({
      model: groqModel, messages, max_tokens: Math.min(aiMaxTokens, 1800), stream: true,
      stream_options: { include_usage: true },
      tools: tools as any,
      tool_choice: 'auto',
      parallel_tool_calls: false,
    }).withResponse());

    const stream = streamResponse.data;
    quota = parseGroqRateLimitQuota(streamResponse.response.headers);
    const toolCalls = new Map<number, { id?: string; name?: string; arguments: string }>();
    assistantContent = '';

    let isTruncated = false;
    for await (const chunk of stream) {
      if (chunk.usage) apiUsage = chunk.usage;
      const choice = chunk.choices[0];
      if (choice?.finish_reason === 'length') {
        isTruncated = true;
      }
      const delta = choice?.delta;
      const text = delta?.content || '';
      assistantContent += text;
      input.accumulatedContent = assistantContent;
      // Trả content về client ngay lập tức nếu không phải là tool call
      if (text) res.write(`data: ${JSON.stringify({ content: text })}\n\n`);

      for (const toolCall of delta?.tool_calls || []) {
        const index = toolCall.index ?? toolCalls.size;
        const existing = toolCalls.get(index) || { arguments: '' };
        toolCalls.set(index, {
          id: toolCall.id || existing.id,
          name: toolCall.function?.name || existing.name,
          arguments: existing.arguments + (toolCall.function?.arguments || ''),
        });
      }
    }

    if (isTruncated) {
      throw new Error('Groq stream truncated by max_tokens limit');
    }

    if (toolCalls.size > 0) {
      loopCount++;
      const normalizedToolCalls = [...toolCalls.values()].map((toolCall, index) => ({
        ...toolCall,
        id: toolCall.id || `tool_call_${index}`,
      }));

      messages.push({
        role: 'assistant',
        content: assistantContent || null,
        tool_calls: normalizedToolCalls.map((toolCall) => {
          let cleanName = toolCall.name || '';
          if (cleanName.includes('{')) {
            cleanName = cleanName.substring(0, cleanName.indexOf('{')).trim();
          }
          return {
            id: toolCall.id,
            type: 'function',
            function: {
              name: cleanName,
              arguments: toolCall.arguments || '{}',
            },
          };
        }),
      } as any);

      let toolExecuted = false;
      let loopGuardTriggered = false;
      for (const toolCall of normalizedToolCalls) {
        let toolName = toolCall.name || '';
        if (toolName.includes('{')) {
          toolName = toolName.substring(0, toolName.indexOf('{')).trim();
        }
        if (!toolName) continue;

        const callCheck = buildToolCallKey(toolName, toolCall.arguments);
        if (calledCalls.has(callCheck)) {
          logger.warn(`[LoopGuard] Groq Stream AI is repeating tool call: ${callCheck}. Forcing response.`);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: 'You have already performed this exact tool call. Use previous results or reply directly.' }),
          } as any);
          loopGuardTriggered = true;
          break;
        }

        calledCalls.add(callCheck);
        let args: any = {};
        try {
          args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
        } catch {
          args = {};
        }

        const toolResult = await executeTool(toolName, args, familyId, userId, trace);
        if (isActionProposalResult(toolResult)) {
          const usage = buildUsageSnapshot({
            provider: 'groq', model: groqModel, contextWindow: groqContextWindow, maxOutputTokens: aiMaxTokens,
            historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
            completionText: getActionProposalContent(toolResult), apiUsage, quota,
          });
          const proposalContent = `${getActionProposalContent(toolResult)}\n<!-- action_proposal:${toolResult.proposalId} -->`;
          await chatService.saveMessage(familyId, 'assistant', proposalContent, sessionId);
          writeActionProposalStream(res, toolResult, usage);
          return;
        }

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        } as any);
        toolExecuted = true;
      }

      if (loopGuardTriggered || !toolExecuted) {
        break;
      }
    } else {
      break;
    }
  }

  if (assistantContent.includes('<function')) {
    const pseudoCount = await executePseudoFunctionCalls(assistantContent, deps, input);
    if (pseudoCount > 0) {
      assistantContent = stripPseudoFunctionTags(assistantContent);
      res.write(`data: ${JSON.stringify({ type: 'replace_content', content: assistantContent })}\n\n`);
    }
  }

  assistantContent = decorateFinalAssistantContent(assistantContent, deps, res);
  assistantContent = await sanitizeFinalAssistantContent(assistantContent, deps, 'groq_stream', res);

  // assistantContent is reset to '' at the top of every tool-calling round (see above), so it
  // only ever holds the LAST round's text — correct for what gets saved/returned. But some Groq
  // models (reasoning-capable ones observed to do this) stream narrative text alongside/before
  // a tool_call in an earlier round, and that text was already forwarded to the client via raw
  // `content` deltas with no signal to discard it. The client just appends every delta it sees
  // (see useChatStream.ts), so that earlier narration stays visible once the final round streams
  // in and naturally restates the same (now tool-grounded) facts — showing as an exact duplicate.
  // Force-sync the client to the true final content so any such leftover narration is corrected,
  // regardless of whether anything above needed to touch assistantContent.
  res.write(`data: ${JSON.stringify({ type: 'replace_content', content: assistantContent })}\n\n`);

  const usage = buildUsageSnapshot({
    provider: 'groq', model: groqModel, contextWindow: groqContextWindow, maxOutputTokens: aiMaxTokens, historyLimit,
    promptText: buildPromptText(familyInfo, history, finalUserMessage, systemPromptOverride, dynamicSuffix),
    completionText: assistantContent, apiUsage, quota,
  });

  res.write(`data: ${JSON.stringify({ type: 'usage', usage })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
  await chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  return { content: assistantContent, familyId, usage };
}
