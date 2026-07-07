import { Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './services/chat.service';
import { buildSystemPrompt } from './ai-agent-prompt';
import { getTools, getGeminiTools } from './ai-agent-tools';
import { AiIntentRoute } from './ai-intent-router';
import { AiTrace, measureAiStep } from './ai-observability';
import { sanitizeAiResponse } from './ai-response-sanitizer';

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
  toolsOverride?: any[];
  image?: string;
}

export interface StreamHandlerInput extends ChatHandlerInput {
  res: any;
}

function buildPromptText(familyInfo: string, history: any[], userMessage: string, intent: string, override?: string) {
  return `${override || buildSystemPrompt(familyInfo, intent as any)}\n\nHistory: ${JSON.stringify(history)}\n\nUser: ${userMessage}`;
}

function buildUsageSnapshot(data: any) {
  return {
    ...data,
    timestamp: new Date().toISOString(),
  };
}

function isActionProposalResult(value: any) {
  return value?.type === 'action_proposal' && value?.proposalId;
}

function getActionProposalContent(value: any) {
  return value?.message || 'Mình đã chuẩn bị thao tác này. Bạn xác nhận trước khi lưu nhé.';
}

async function returnActionProposalChat(deps: ModelHandlerDeps, input: ChatHandlerInput, proposal: any, usage: any) {
  const content = getActionProposalContent(proposal);
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

function unavailableQuota(note: string) {
  return { source: 'unavailable', note };
}

function parseGroqRateLimitQuota(headers: any) {
  return {
    source: 'headers',
    limitRequests: parseInt(headers['x-ratelimit-limit-requests'] || '0', 10),
    remainingRequests: parseInt(headers['x-ratelimit-remaining-requests'] || '0', 10),
    resetRequests: headers['x-ratelimit-reset-requests'],
    limitTokens: parseInt(headers['x-ratelimit-limit-tokens'] || '0', 10),
    remainingTokens: parseInt(headers['x-ratelimit-remaining-tokens'] || '0', 10),
    resetTokens: headers['x-ratelimit-reset-tokens'],
  };
}

function isRetryableGeminiError(error: any): boolean {
  const status = error?.status;
  const message = String(error?.message || error || '').toLowerCase();
  return status === 429 || status === 500 || status === 503 || message.includes('high demand');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function withGeminiRetry<T>(
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

function sanitizeFinalAssistantContent(content: string, deps: ModelHandlerDeps, context: string, res?: any) {
  const sanitized = sanitizeAiResponse(content);
  if (!sanitized.sanitized) return content;

  deps.logger.warn(`[ResponseSanitizer] ${context}: ${sanitized.reasons.join(', ')}`);
  if (res) {
    res.write(`data: ${JSON.stringify({ type: 'replace_content', content: sanitized.content })}\n\n`);
  }
  return sanitized.content;
}

export async function handleGeminiChat(deps: ModelHandlerDeps, input: ChatHandlerInput) {
  const { gemini, chatService, logger, executeTool, geminiModel, geminiContextWindow, aiMaxTokens, historyLimit } = deps;
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, systemPromptOverride, toolsOverride, image } = input;

  const systemPrompt = systemPromptOverride || buildSystemPrompt(familyInfo, intentRoute.intent);
  const tools = toolsOverride ?
    [{ functionDeclarations: toolsOverride.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }] :
    getGeminiTools();

  const genModel = gemini.getGenerativeModel({
    model: geminiModel,
    systemInstruction: systemPrompt,
    ...(intentRoute.requiresTools || toolsOverride ? { tools } : {}),
  });

  const geminiHistory = [...history].reverse()
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    .filter((m, i) => !(i === 0 && m.role === 'model'));

  const chat = genModel.startChat({ history: geminiHistory });

  let currentInput: any;
  if (image) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (match) {
      currentInput = [
        { text: finalUserMessage || 'Phân tích và mô tả chi tiết hình ảnh này.' },
        { inlineData: { data: match[2].replace(/\s/g, ''), mimeType: match[1] } }
      ];
    } else {
      currentInput = finalUserMessage;
    }
  } else {
    currentInput = finalUserMessage;
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
      const callCheck = `${part.functionCall.name}:${JSON.stringify(part.functionCall.args)}`;
      if (calledCalls.has(callCheck)) {
        currentInput = [{ functionResponse: { name: part.functionCall.name, response: { error: 'Already searched. Use previous info.' } } }];
      } else {
        calledCalls.add(callCheck);
        const res = await executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, trace);
        if (isActionProposalResult(res)) {
          const usage = buildUsageSnapshot({
            provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
            historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
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

  assistantContent = sanitizeFinalAssistantContent(assistantContent, deps, 'gemini_chat');
  const usage = buildUsageSnapshot({
    provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
    historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
    completionText: assistantContent, apiUsage, quota: unavailableQuota('Gemini API does not expose quota.'),
  });

  await chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  return { content: assistantContent, familyId, usage };
}

export async function handleGroqChat(deps: ModelHandlerDeps, input: ChatHandlerInput) {
  const { openai, chatService, groqModel, aiMaxTokens, groqContextWindow, historyLimit, logger, executeTool } = deps;
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, systemPromptOverride, toolsOverride } = input;

  const systemPrompt = systemPromptOverride || buildSystemPrompt(familyInfo, intentRoute.intent);
  const messages = [{ role: 'system', content: systemPrompt }, ...[...history].reverse().map(m => ({ role: m.role as any, content: m.content })), { role: 'user', content: finalUserMessage }];
  const toolsEnabled = intentRoute.requiresTools || !!toolsOverride;
  const tools = toolsOverride || getTools();

  const initialResult = await measureAiStep(logger, 'model_call', trace, { provider: 'groq', phase: 'initial' }, () => openai.chat.completions.create({
    model: groqModel,
    messages,
    max_tokens: aiMaxTokens,
    ...(toolsEnabled ? { tools: tools as any, tool_choice: 'auto', parallel_tool_calls: false } : {}),
  }).withResponse());
  const response = initialResult.data;
  let quota = parseGroqRateLimitQuota(initialResult.response.headers);
  let assistantContent = '';
  let apiUsage = response.usage;

  if (response.choices[0].message.tool_calls) {
    messages.push(response.choices[0].message as any);
    for (const tc of response.choices[0].message.tool_calls) {
      let toolName = tc.function.name;
      if (toolName.includes('{')) {
        toolName = toolName.substring(0, toolName.indexOf('{')).trim();
      }
      const res = await executeTool(toolName, JSON.parse(tc.function.arguments), familyId, userId, trace);
      if (isActionProposalResult(res)) {
        const usage = buildUsageSnapshot({
          provider: 'groq', model: groqModel, contextWindow: groqContextWindow, maxOutputTokens: aiMaxTokens,
          historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
          completionText: getActionProposalContent(res), apiUsage, quota,
        });
        return returnActionProposalChat(deps, input, res, usage);
      }
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) } as any);
    }
    const finalResult = await measureAiStep(logger, 'model_call', trace, { provider: 'groq', phase: 'final' }, () => openai.chat.completions.create({ model: groqModel, messages, max_tokens: aiMaxTokens }).withResponse());
    assistantContent = finalResult.data.choices[0].message.content || '';
    quota = parseGroqRateLimitQuota(finalResult.response.headers);
  } else {
    assistantContent = response.choices[0].message.content || '';
  }

  if (assistantContent.includes('<function')) {
    const pseudoCount = await executePseudoFunctionCalls(assistantContent, deps, input);
    if (pseudoCount > 0) {
      assistantContent = stripPseudoFunctionTags(assistantContent);
    }
  }

  assistantContent = sanitizeFinalAssistantContent(assistantContent, deps, 'groq_chat');
  const usage = buildUsageSnapshot({
    provider: 'groq', model: groqModel, contextWindow: groqContextWindow, maxOutputTokens: aiMaxTokens, historyLimit,
    promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
    completionText: assistantContent, apiUsage, quota,
  });

  await chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  return { content: assistantContent, familyId, usage };
}

export async function handleGeminiStream(deps: ModelHandlerDeps, input: StreamHandlerInput) {
  const { gemini, chatService, executeTool, geminiModel, geminiContextWindow, aiMaxTokens, historyLimit } = deps;
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, res, systemPromptOverride, toolsOverride, image } = input;

  const systemPrompt = systemPromptOverride || buildSystemPrompt(familyInfo, intentRoute.intent);
  const tools = toolsOverride ?
    [{ functionDeclarations: toolsOverride.map(t => ({ name: t.function.name, description: t.function.description, parameters: t.function.parameters })) }] :
    getGeminiTools();

  const genModel = gemini.getGenerativeModel({ model: geminiModel, systemInstruction: systemPrompt, ...(intentRoute.requiresTools || toolsOverride ? { tools } : {}) });
  const geminiHistory = [...history].reverse()
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    .filter((m, i) => !(i === 0 && m.role === 'model'));

  const chat = genModel.startChat({ history: geminiHistory });

  let currentInput: any;
  if (image) {
    const match = image.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
    if (match) {
      currentInput = [
        { text: finalUserMessage || 'Phân tích và mô tả chi tiết hình ảnh này.' },
        { inlineData: { data: match[2].replace(/\s/g, ''), mimeType: match[1] } }
      ];
    } else {
      currentInput = finalUserMessage;
    }
  } else {
    currentInput = finalUserMessage;
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
    for await (const chunk of result.stream) {
      const part = chunk.candidates?.[0]?.content?.parts?.[0];
      if (part?.functionCall) {
        isTool = true;
        const callCheck = `${part.functionCall.name}:${JSON.stringify(part.functionCall.args)}`;
        if (calledCalls.has(callCheck)) {
          deps.logger.warn(`[LoopGuard] AI is repeating tool call: ${callCheck}. Forcing response.`);
          currentInput = [{ functionResponse: { name: part.functionCall.name, response: { error: 'You have already performed this exact search. Use the previous results to answer the user now.' } } }];
        } else {
          calledCalls.add(callCheck);
          const toolRes = await executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, trace);
          if (isActionProposalResult(toolRes)) {
            const usage = buildUsageSnapshot({
              provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
              historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
              completionText: getActionProposalContent(toolRes), apiUsage,
              quota: unavailableQuota('Gemini API does not expose quota.'),
            });
            await chatService.saveMessage(familyId, 'assistant', getActionProposalContent(toolRes), sessionId);
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
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        if (chunk.usageMetadata) apiUsage = chunk.usageMetadata;
      } catch (e) {
        // Handle blocked content or non-text chunks
        continue;
      }
    }
    if (!isTool) break;
    loopCount++;
  }

  if (assistantContent.includes('<function')) {
    const pseudoCount = await executePseudoFunctionCalls(assistantContent, deps, input);
    if (pseudoCount > 0) {
      assistantContent = stripPseudoFunctionTags(assistantContent);
      res.write(`data: ${JSON.stringify({ type: 'replace_content', content: assistantContent })}\n\n`);
    }
  }

  assistantContent = sanitizeFinalAssistantContent(assistantContent, deps, 'gemini_stream', res);
  const usage = buildUsageSnapshot({
    provider: 'gemini', model: geminiModel, contextWindow: geminiContextWindow, maxOutputTokens: aiMaxTokens,
    historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
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
  const { familyId, history, familyInfo, finalUserMessage, userId, intentRoute, sessionId, trace, res, systemPromptOverride, toolsOverride } = input;

  const systemPrompt = systemPromptOverride || buildSystemPrompt(familyInfo, intentRoute.intent);
  const messages = [{ role: 'system', content: systemPrompt }, ...[...history].reverse().map(m => ({ role: m.role as any, content: m.content })), { role: 'user', content: finalUserMessage }];
  const toolsEnabled = intentRoute.requiresTools || !!toolsOverride;
  const tools = toolsOverride || getTools();

  const streamResponse = await openai.chat.completions.create({
    model: groqModel, messages, max_tokens: aiMaxTokens, stream: true,
    stream_options: { include_usage: true },
    ...(toolsEnabled ? { tools: tools as any, tool_choice: 'auto', parallel_tool_calls: false } : {})
  }).withResponse();

  const stream = streamResponse.data;
  let quota = parseGroqRateLimitQuota(streamResponse.response.headers);
  let assistantContent = '';
  let apiUsage: any;
  const toolCalls = new Map<number, { id?: string; name?: string; arguments: string }>();

  for await (const chunk of stream) {
    if (chunk.usage) apiUsage = chunk.usage;
    const delta = chunk.choices[0]?.delta;
    const text = delta?.content || '';
    assistantContent += text;
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

  if (toolCalls.size > 0) {
    logger.debug(`Groq stream requested ${toolCalls.size} tool call(s)`);
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

    for (const toolCall of normalizedToolCalls) {
      let toolName = toolCall.name || '';
      // Clean tool name if it contains JSON clutter
      if (toolName.includes('{')) {
        toolName = toolName.substring(0, toolName.indexOf('{')).trim();
      }

      if (!toolName) continue;
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
          historyLimit, promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
          completionText: getActionProposalContent(toolResult), apiUsage, quota,
        });
        await chatService.saveMessage(familyId, 'assistant', getActionProposalContent(toolResult), sessionId);
        writeActionProposalStream(res, toolResult, usage);
        return;
      }
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(toolResult),
      } as any);
    }

    const finalStreamResponse = await openai.chat.completions.create({
      model: groqModel, messages, max_tokens: aiMaxTokens, stream: true,
      stream_options: { include_usage: true }
    }).withResponse();

    const finalStream = finalStreamResponse.data;
    quota = parseGroqRateLimitQuota(finalStreamResponse.response.headers);
    assistantContent = '';

    for await (const chunk of finalStream) {
      if (chunk.usage) apiUsage = chunk.usage;
      const text = chunk.choices[0]?.delta?.content || '';
      assistantContent += text;
      if (text) res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
    }
  }

  if (assistantContent.includes('<function')) {
    const pseudoCount = await executePseudoFunctionCalls(assistantContent, deps, input);
    if (pseudoCount > 0) {
      assistantContent = stripPseudoFunctionTags(assistantContent);
      res.write(`data: ${JSON.stringify({ type: 'replace_content', content: assistantContent })}\n\n`);
    }
  }

  assistantContent = sanitizeFinalAssistantContent(assistantContent, deps, 'groq_stream', res);
  const usage = buildUsageSnapshot({
    provider: 'groq', model: groqModel, contextWindow: groqContextWindow, maxOutputTokens: aiMaxTokens, historyLimit,
    promptText: buildPromptText(familyInfo, history, finalUserMessage, intentRoute.intent, systemPromptOverride),
    completionText: assistantContent, apiUsage, quota,
  });

  res.write(`data: ${JSON.stringify({ type: 'usage', usage })}\n\n`);
  res.write('data: [DONE]\n\n');
  res.end();
  await chatService.saveMessage(familyId, 'assistant', assistantContent, sessionId);
  return { content: assistantContent, familyId, usage };
}
