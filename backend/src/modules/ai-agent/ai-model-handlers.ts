import { Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ChatService } from './services/chat.service';
import { buildSystemPrompt } from './ai-agent-prompt';
import { getTools, getGeminiTools } from './ai-agent-tools';
import { AiIntentRoute } from './ai-intent-router';
import { AiTrace, measureAiStep } from './ai-observability';

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
      const res = await executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, trace);
      currentInput = [{ functionResponse: { name: part.functionCall.name, response: res } }];
    } else {
      apiUsage = result.response.usageMetadata;
      assistantContent = result.response.text();
      break;
    }
  }

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

  const initialResult = await measureAiStep(logger, 'model_call', trace, { provider: 'groq', phase: 'initial' }, () => openai.chat.completions.create({ model: groqModel, messages, max_tokens: aiMaxTokens, ...(toolsEnabled ? { tools: tools as any } : {}) }).withResponse());
  const response = initialResult.data;
  let quota = parseGroqRateLimitQuota(initialResult.response.headers);
  let assistantContent = '';
  let apiUsage = response.usage;

  if (response.choices[0].message.tool_calls) {
    messages.push(response.choices[0].message as any);
    for (const tc of response.choices[0].message.tool_calls) {
      const res = await executeTool(tc.function.name, JSON.parse(tc.function.arguments), familyId, userId, trace);
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(res) } as any);
    }
    const finalResult = await measureAiStep(logger, 'model_call', trace, { provider: 'groq', phase: 'final' }, () => openai.chat.completions.create({ model: groqModel, messages, max_tokens: aiMaxTokens }).withResponse());
    assistantContent = finalResult.data.choices[0].message.content || '';
    quota = parseGroqRateLimitQuota(finalResult.response.headers);
  } else {
    assistantContent = response.choices[0].message.content || '';
  }

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
        const toolRes = await executeTool(part.functionCall.name, part.functionCall.args, familyId, userId, trace);
        currentInput = [{ functionResponse: { name: part.functionCall.name, response: toolRes } }];
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
    ...(toolsEnabled ? { tools: tools as any } : {})
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
      tool_calls: normalizedToolCalls.map((toolCall) => ({
        id: toolCall.id,
        type: 'function',
        function: {
          name: toolCall.name || '',
          arguments: toolCall.arguments || '{}',
        },
      })),
    } as any);

    for (const toolCall of normalizedToolCalls) {
      if (!toolCall.name) continue;
      let args: any = {};
      try {
        args = toolCall.arguments ? JSON.parse(toolCall.arguments) : {};
      } catch {
        args = {};
      }
      const toolResult = await executeTool(toolCall.name, args, familyId, userId, trace);
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
