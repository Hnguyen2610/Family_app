import { handleGroqChat } from './ai-model-handlers';

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

    // Loop count should stop at the safety boundary of 5 iterations because of LoopGuard detection
    expect(mockOpenai.chat.completions.create).toHaveBeenCalledTimes(5);
    expect(deps.executeTool).toHaveBeenCalledTimes(1); // Execute tool exactly once, then blocked on repeating call
  });

  it('triggers Critic audit block and fixes output containing leaked system function call syntax or JSON leaks', async () => {
    const leakingContent = 'Tôi đã cập nhật sự kiện cho bạn. <function:createEvent arg="something"/> {"status":"ok"}';

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

    const criticAuditResponse = {
      choices: [
        {
          message: {
            role: 'assistant',
            content: JSON.stringify({
              isValid: false,
              reasons: ['Rò rỉ thẻ function và dữ liệu JSON thô'],
              fixedContent: 'Tôi đã cập nhật thành công sự kiện cho gia đình mình rồi nhé.',
            }),
          },
        },
      ],
    };

    let callCount = 0;
    mockOpenai.chat.completions.create = jest.fn().mockImplementation((args) => {
      callCount++;
      if (callCount === 1) {
        return {
          withResponse: jest.fn().mockResolvedValue(rawHandlerResponse),
        };
      } else {
        return criticAuditResponse;
      }
    });

    const result = await handleGroqChat(deps, input);

    expect(result.content).toBe('Tôi đã cập nhật thành công sự kiện cho gia đình mình rồi nhé.');
    expect(callCount).toBe(2);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('[CriticAudit] Critic flagged output!')
    );
  });
});
