import { handleGroqChat, handleGeminiChat, handleGeminiStream, handleGroqStream } from './ai-model-handlers';

describe('ai-model-handlers - Groq ReAct Loop', () => {
  let deps: any;
  let input: any;
  let mockOpenai: any;
  let mockChatService: any;
  let mockLogger: any;

  beforeEach(() => {
    mockChatService = {
      saveMessage: jest.fn().mockResolvedValue(null),
    };
    mockLogger = {
      debug: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    };

    mockOpenai = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    };

    deps = {
      openai: mockOpenai,
      chatService: mockChatService,
      logger: mockLogger,
      groqModel: 'llama-3.3',
      aiMaxTokens: 800,
      groqContextWindow: 131072,
      historyLimit: 6,
      executeTool: jest.fn(),
    };

    input = {
      familyId: 'family-1',
      history: [],
      familyInfo: 'Family info text',
      finalUserMessage: 'Tìm sự kiện và tóm tắt giúp tôi',
      userId: 'user-1',
      intentRoute: { intent: 'calendar_query', requiresTools: true },
    };
  });

  it('runs Groq ReAct loop for sequential tool execution and ends with final text', async () => {
    // 1st turn: returns a tool call to 'getEventsByMonth'
    const turn1Response = {
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-a',
                  type: 'function',
                  function: { name: 'getEventsByMonth', arguments: '{"month":7}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      },
      response: {
        headers: new Map([
          ['x-ratelimit-limit-requests', '100'],
          ['x-ratelimit-remaining-requests', '99'],
        ]) as any,
      },
    };

    // 2nd turn: returns final content response based on tool output
    const turn2Response = {
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: 'Lịch hôm nay trống tuếch.',
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 15 },
      },
      response: {
        headers: new Map() as any,
      },
    };

    mockOpenai.chat.completions.create.mockReturnValueOnCall = (callIdx: number) => {
      // helper
    };

    let callCount = 0;
    mockOpenai.chat.completions.create = jest.fn().mockImplementation(() => {
      callCount++;
      const res = callCount === 1 ? turn1Response : turn2Response;
      return {
        withResponse: jest.fn().mockResolvedValue(res),
      };
    });

    deps.executeTool.mockResolvedValue({ ok: true, data: [{ title: 'Họp team' }] });

    const result = await handleGroqChat(deps, input);

    expect(result.content).toBe('Lịch hôm nay trống tuếch.');
    expect(callCount).toBe(2); // Initial call + second call after tool execution
    expect(deps.executeTool).toHaveBeenCalledWith('getEventsByMonth', { month: 7 }, 'family-1', 'user-1', undefined);
    expect(mockChatService.saveMessage).toHaveBeenCalledWith('family-1', 'assistant', 'Lịch hôm nay trống tuếch.', undefined);

    // Regression coverage: result.usage must have real computed totalTokens (from the last
    // turn's apiUsage) and real quota parsed from response.headers via .get() — a prior bug
    // had ai-model-handlers.ts shadow ai-usage.ts's buildUsageSnapshot/parseGroqRateLimitQuota
    // with local stubs that never computed totalTokens and read headers with bracket access
    // (headers['x-...'] instead of headers.get('x-...')), which silently always produced
    // totalTokens: undefined and quota.remainingRequests: 0 regardless of the real values.
    expect(result.usage.totalTokens).toBe(40 + 15); // turn2Response's apiUsage
    expect(result.usage.quota.source).toBe('headers'); // turn2Response.response.headers is a (empty) Map, not null
  });

  it('reads real rate-limit values from response.headers via .get() (regression: bracket access on a Headers-like object always silently read as undefined/0)', async () => {
    mockOpenai.chat.completions.create = jest.fn().mockImplementation(() => ({
      withResponse: jest.fn().mockResolvedValue({
        data: {
          choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: null } }],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        },
        response: {
          headers: new Map([
            ['x-ratelimit-limit-requests', '14400'],
            ['x-ratelimit-remaining-requests', '14237'],
          ]) as any,
        },
      }),
    }));

    const result = await handleGroqChat(deps, input);

    expect(result.usage.totalTokens).toBe(20);
    expect(result.usage.quota.remainingRequests).toBe(14237);
    expect(result.usage.quota.limitRequests).toBe(14400);
  });

  it('prevents infinite recursion loop under LoopGuard if duplicate tool arguments occur', async () => {
    // Both turns returning identical tool call 'getEventsByMonth'
    const repeatingToolResponse = {
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-repeat',
                  type: 'function',
                  function: { name: 'getEventsByMonth', arguments: '{"month":7}' },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      },
      response: { headers: new Map() as any },
    };

    mockOpenai.chat.completions.create = jest.fn().mockImplementation(() => {
      return {
        withResponse: jest.fn().mockResolvedValue(repeatingToolResponse),
      };
    });

    deps.executeTool.mockResolvedValue({ ok: true });

    const result = await handleGroqChat(deps, input);

    // LoopGuard should break the loop immediately when duplicate detected:
    // Iteration 1: execute tool, iteration 2: detect duplicate → break
    expect(mockOpenai.chat.completions.create).toHaveBeenCalledTimes(2);
    expect(deps.executeTool).toHaveBeenCalledTimes(1); // Execute tool exactly once, then blocked on repeating call
  });

  it('bypasses secondary LLM critic audit for ultra-fast response latency', async () => {
    const leakingContent = 'Tôi đã cập nhật thành công sự kiện cho gia đình mình rồi nhé.';

    const rawHandlerResponse = {
      data: {
        choices: [
          {
            message: {
              role: 'assistant',
              content: leakingContent,
              tool_calls: null,
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 30 },
      },
      response: { headers: new Map() as any },
    };

    let callCount = 0;
    mockOpenai.chat.completions.create = jest.fn().mockImplementation((args) => {
      callCount++;
      return {
        withResponse: jest.fn().mockResolvedValue(rawHandlerResponse),
      };
    });

    const result = await handleGroqChat(deps, input);

    expect(result.content).toBe('Tôi đã cập nhật thành công sự kiện cho gia đình mình rồi nhé.');
    expect(callCount).toBe(1);
  });

  it('gộp dynamicSuffix trực tiếp vào message system đầu tiên để Groq API ưu tiên cao nhất', async () => {
    const finalResponse = {
      data: {
        choices: [{ message: { role: 'assistant', content: 'OK.', tool_calls: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      response: { headers: new Map() as any },
    };

    let capturedMessages: any[] = [];
    mockOpenai.chat.completions.create = jest.fn().mockImplementation((args) => {
      capturedMessages = args.messages;
      return { withResponse: jest.fn().mockResolvedValue(finalResponse) };
    });

    await handleGroqChat(deps, { ...input, dynamicSuffix: 'CALENDAR TOOL RULES: ...' });

    expect(capturedMessages[0].content).toContain('CALENDAR TOOL RULES');
    const lastMessage = capturedMessages[capturedMessages.length - 1];
    expect(lastMessage).toEqual({ role: 'user', content: input.finalUserMessage });
  });

  it('không thêm message nào khi dynamicSuffix rỗng/không có — hành vi giống hệt trước đây', async () => {
    const finalResponse = {
      data: {
        choices: [{ message: { role: 'assistant', content: 'OK.', tool_calls: null } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      response: { headers: new Map() as any },
    };

    let capturedMessages: any[] = [];
    mockOpenai.chat.completions.create = jest.fn().mockImplementation((args) => {
      capturedMessages = args.messages;
      return { withResponse: jest.fn().mockResolvedValue(finalResponse) };
    });

    await handleGroqChat(deps, input);

    expect(capturedMessages).toHaveLength(2);
    expect(capturedMessages[1]).toEqual({ role: 'user', content: input.finalUserMessage });
  });
});

describe('ai-model-handlers - Groq stream tool-call narration duplication', () => {
  let deps: any;
  let input: any;
  let mockOpenai: any;
  let mockChatService: any;
  let mockLogger: any;
  let mockRes: any;

  function buildGroqStream(chunks: any[]) {
    return (async function* () {
      for (const c of chunks) yield c;
    })();
  }

  beforeEach(() => {
    mockChatService = { saveMessage: jest.fn().mockResolvedValue(null) };
    mockLogger = { debug: jest.fn(), warn: jest.fn(), log: jest.fn(), error: jest.fn() };
    mockRes = { write: jest.fn(), end: jest.fn() };
    mockOpenai = { chat: { completions: { create: jest.fn() } } };

    deps = {
      openai: mockOpenai,
      chatService: mockChatService,
      logger: mockLogger,
      groqModel: 'qwen/qwen3.6-27b',
      aiMaxTokens: 800,
      groqContextWindow: 131072,
      historyLimit: 6,
      executeTool: jest.fn(),
    };

    input = {
      familyId: 'family-1',
      history: [],
      familyInfo: 'Family info text',
      finalUserMessage: 'bao giờ ngoại hạng anh bắt đầu mùa giải mới',
      userId: 'user-1',
      intentRoute: { intent: 'football', requiresTools: true },
      res: mockRes,
    };
  });

  it('does not leave pre-tool-call narration duplicated alongside the final answer on the client', async () => {
    // Round 1: model narrates BEFORE calling a tool (observed with reasoning-capable Groq
    // models like qwen3) — this text streams to the client via raw `content` deltas even
    // though it is not the final answer.
    const round1 = {
      data: buildGroqStream([
        { choices: [{ delta: { content: 'Để mình tra lịch thi đấu mới nhất nhé...' }, finish_reason: null }] },
        { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call-1', function: { name: 'get_matches', arguments: '{}' } }] }, finish_reason: null }] },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
      ]),
      response: { headers: new Map() as any },
    };
    // Round 2: the real final answer, grounded by the tool result — naturally restates the
    // same facts, which is what makes round 1's narration read as an exact duplicate.
    const round2 = {
      data: buildGroqStream([
        { choices: [{ delta: { content: 'Mùa giải mới khởi tranh 21/8/2026.' }, finish_reason: null }], usage: { prompt_tokens: 5, completion_tokens: 5 } },
        { choices: [{ delta: {}, finish_reason: 'stop' }] },
      ]),
      response: { headers: new Map() as any },
    };

    let callCount = 0;
    mockOpenai.chat.completions.create.mockImplementation(() => {
      callCount++;
      const res = callCount === 1 ? round1 : round2;
      return { withResponse: jest.fn().mockResolvedValue(res) };
    });
    deps.executeTool.mockResolvedValue({ ok: true, data: [{ title: 'Arsenal vs Coventry City' }] });

    const result = await handleGroqStream(deps, input);

    expect(result?.content).toBe('Mùa giải mới khởi tranh 21/8/2026.');

    // The client must receive an authoritative replace_content sync with exactly the final
    // round's text — not the two rounds concatenated — so any narration it already rendered
    // from round 1's raw content deltas gets corrected instead of staying duplicated.
    const replaceEvents = mockRes.write.mock.calls
      .map((call: any[]) => call[0])
      .filter((line: string) => line.includes('"type":"replace_content"'))
      .map((line: string) => JSON.parse(line.replace(/^data: /, '').trim()));

    expect(replaceEvents.length).toBeGreaterThan(0);
    expect(replaceEvents.at(-1).content).toBe('Mùa giải mới khởi tranh 21/8/2026.');
  });
});

describe('ai-model-handlers - Gemini chat dynamicSuffix / image caption handling', () => {
  let deps: any;
  let input: any;
  let mockGemini: any;
  let mockChatService: any;
  let mockLogger: any;
  let getGenerativeModelMock: jest.Mock;
  let sendMessageMock: jest.Mock;

  const buildFinalResponse = (text: string) => ({
    response: {
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
      text: () => text,
    },
  });

  beforeEach(() => {
    mockChatService = {
      saveMessage: jest.fn().mockResolvedValue(null),
    };
    mockLogger = {
      debug: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    };

    sendMessageMock = jest.fn().mockResolvedValue(buildFinalResponse('OK từ Gemini.'));

    getGenerativeModelMock = jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessage: sendMessageMock,
      }),
    });

    mockGemini = {
      getGenerativeModel: getGenerativeModelMock,
    };

    deps = {
      gemini: mockGemini,
      chatService: mockChatService,
      logger: mockLogger,
      geminiModel: 'gemini-1.5-flash',
      aiMaxTokens: 800,
      geminiContextWindow: 1000000,
      historyLimit: 6,
      executeTool: jest.fn(),
    };

    input = {
      familyId: 'family-1',
      history: [],
      familyInfo: 'Family info text',
      finalUserMessage: 'Hôm nay có sự kiện gì không?',
      userId: 'user-1',
      intentRoute: { intent: 'calendar_query', requiresTools: true },
    };
  });

  it('truyền systemInstruction ổn định (không đổi) cho getGenerativeModel, không bao giờ chứa dynamicSuffix', async () => {
    await handleGeminiChat(deps, { ...input, dynamicSuffix: 'PERSONA SUFFIX RULES: ...' });

    expect(getGenerativeModelMock).toHaveBeenCalledTimes(1);
    const callArgs = getGenerativeModelMock.mock.calls[0][0];
    expect(typeof callArgs.systemInstruction).toBe('string');
    expect(callArgs.systemInstruction).not.toContain('PERSONA SUFFIX RULES');
  });

  it('gắn dynamicSuffix làm prefix của finalUserMessage khi gửi cho chat.sendMessage khi không có ảnh', async () => {
    await handleGeminiChat(deps, { ...input, dynamicSuffix: 'PERSONA SUFFIX RULES: ...' });

    expect(sendMessageMock).toHaveBeenCalledWith(`PERSONA SUFFIX RULES: ...\n\n${input.finalUserMessage}`);
  });

  it('[Regression Finding 1] ảnh có caption rỗng vẫn nhận câu mô tả mặc định dù dynamicSuffix đang có giá trị', async () => {
    await handleGeminiChat(deps, {
      ...input,
      finalUserMessage: '',
      dynamicSuffix: 'PERSONA SUFFIX RULES: ...',
      image: 'data:image/png;base64,AAAA',
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const sentParts = sendMessageMock.mock.calls[0][0];
    expect(sentParts[0].text).toBe('PERSONA SUFFIX RULES: ...\n\nPhân tích và mô tả chi tiết hình ảnh này.');
    expect(sentParts[1].inlineData.mimeType).toBe('image/png');
  });

  it('ảnh có caption thật vẫn được gắn dynamicSuffix như prefix (không bị ghi đè bởi câu mô tả mặc định)', async () => {
    await handleGeminiChat(deps, {
      ...input,
      finalUserMessage: 'Đây là ảnh sinh nhật của bé.',
      dynamicSuffix: 'PERSONA SUFFIX RULES: ...',
      image: 'data:image/png;base64,AAAA',
    });

    const sentParts = sendMessageMock.mock.calls[0][0];
    expect(sentParts[0].text).toBe('PERSONA SUFFIX RULES: ...\n\nĐây là ảnh sinh nhật của bé.');
  });

  it('không có dynamicSuffix => hành vi giống hệt trước đây (không thêm prefix ở đâu cả)', async () => {
    await handleGeminiChat(deps, input);

    expect(sendMessageMock).toHaveBeenCalledWith(input.finalUserMessage);
  });

  it('[No-op check] không có dynamicSuffix, ảnh caption rỗng vẫn dùng câu mô tả mặc định như trước khi có plan này', async () => {
    await handleGeminiChat(deps, {
      ...input,
      finalUserMessage: '',
      image: 'data:image/png;base64,AAAA',
    });

    const sentParts = sendMessageMock.mock.calls[0][0];
    expect(sentParts[0].text).toBe('Phân tích và mô tả chi tiết hình ảnh này.');
  });
});

describe('ai-model-handlers - Gemini stream dynamicSuffix / image caption handling', () => {
  let deps: any;
  let input: any;
  let mockGemini: any;
  let mockChatService: any;
  let mockLogger: any;
  let getGenerativeModelMock: jest.Mock;
  let sendMessageStreamMock: jest.Mock;
  let mockRes: any;

  const buildStreamResponse = (text: string) => ({
    stream: (async function* () {
      yield {
        candidates: [{ content: { parts: [{ text }] } }],
        text: () => text,
      };
    })(),
  });

  beforeEach(() => {
    mockChatService = {
      saveMessage: jest.fn().mockResolvedValue(null),
    };
    mockLogger = {
      debug: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      error: jest.fn(),
    };

    sendMessageStreamMock = jest.fn().mockResolvedValue(buildStreamResponse('OK stream.'));

    getGenerativeModelMock = jest.fn().mockReturnValue({
      startChat: jest.fn().mockReturnValue({
        sendMessageStream: sendMessageStreamMock,
      }),
    });

    mockGemini = {
      getGenerativeModel: getGenerativeModelMock,
    };

    mockRes = {
      write: jest.fn(),
      end: jest.fn(),
    };

    deps = {
      gemini: mockGemini,
      chatService: mockChatService,
      logger: mockLogger,
      geminiModel: 'gemini-1.5-flash',
      aiMaxTokens: 800,
      geminiContextWindow: 1000000,
      historyLimit: 6,
      executeTool: jest.fn(),
    };

    input = {
      familyId: 'family-1',
      history: [],
      familyInfo: 'Family info text',
      finalUserMessage: 'Hôm nay có sự kiện gì không?',
      userId: 'user-1',
      intentRoute: { intent: 'calendar_query', requiresTools: true },
      res: mockRes,
    };
  });

  it('truyền systemInstruction ổn định cho getGenerativeModel khi stream, không bao giờ chứa dynamicSuffix', async () => {
    await handleGeminiStream(deps, { ...input, dynamicSuffix: 'PERSONA SUFFIX RULES: ...' });

    const callArgs = getGenerativeModelMock.mock.calls[0][0];
    expect(callArgs.systemInstruction).not.toContain('PERSONA SUFFIX RULES');
  });

  it('gắn dynamicSuffix làm prefix của finalUserMessage khi gửi cho chat.sendMessageStream khi không có ảnh', async () => {
    await handleGeminiStream(deps, { ...input, dynamicSuffix: 'PERSONA SUFFIX RULES: ...' });

    expect(sendMessageStreamMock).toHaveBeenCalledWith(`PERSONA SUFFIX RULES: ...\n\n${input.finalUserMessage}`);
  });

  it('[Regression Finding 1 - stream] ảnh có caption rỗng vẫn nhận câu mô tả mặc định dù dynamicSuffix đang có giá trị', async () => {
    await handleGeminiStream(deps, {
      ...input,
      finalUserMessage: '',
      dynamicSuffix: 'PERSONA SUFFIX RULES: ...',
      image: 'data:image/png;base64,AAAA',
    });

    const sentParts = sendMessageStreamMock.mock.calls[0][0];
    expect(sentParts[0].text).toBe('PERSONA SUFFIX RULES: ...\n\nPhân tích và mô tả chi tiết hình ảnh này.');
  });

  it('không có dynamicSuffix => hành vi giống hệt trước đây (không thêm prefix ở đâu cả) khi stream', async () => {
    await handleGeminiStream(deps, input);

    expect(sendMessageStreamMock).toHaveBeenCalledWith(input.finalUserMessage);
  });
});
