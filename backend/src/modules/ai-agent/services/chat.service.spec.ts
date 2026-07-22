import { ChatService } from './chat.service';

describe('ChatService - Memory Consolidation', () => {
  let service: ChatService;
  let mockPrisma: any;
  let mockRagService: any;
  let mockAiAgentService: any;

  beforeEach(() => {
    mockPrisma = {
      chatSession: {
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
      chatMessage: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'msg-1', ...data })),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
      },
      aiDocument: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockRagService = {
      createKnowledgeDocument: jest.fn().mockResolvedValue({ id: 'doc-1' }),
    };

    mockAiAgentService = {
      generateBriefingText: jest.fn(),
    };

    service = new ChatService(mockPrisma, mockRagService, mockAiAgentService);
  });

  it('does not trigger memory consolidation if message count is less than 15', async () => {
    mockPrisma.chatMessage.count.mockResolvedValue(5); // Less than 15

    await service.saveMessage('family-1', 'user', 'Xin chào AI', 'session-1');

    // Wait a brief tick for background promise to resolve
    await new Promise((resolve) => setImmediate(resolve));

    expect(mockAiAgentService.generateBriefingText).not.toHaveBeenCalled();
    expect(mockRagService.createKnowledgeDocument).not.toHaveBeenCalled();
  });

  it('triggers memory consolidation when message count hits 15 and extracts new knowledge', async () => {
    mockPrisma.chatMessage.count.mockResolvedValue(15);
    mockPrisma.chatMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'Bố thích ăn phở tái lăn.' },
      { role: 'assistant', content: 'Dạ, em ghi nhận sở thích ăn uống của bố rồi ạ.' },
    ]);
    mockAiAgentService.generateBriefingText.mockResolvedValue('- Sở thích ăn uống: Bố thích ăn phở tái lăn.');

    await service.saveMessage('family-1', 'assistant', 'Dạ, em ghi nhận...', 'session-1');

    await new Promise((resolve) => setImmediate(resolve));

    expect(mockAiAgentService.generateBriefingText).toHaveBeenCalledWith(
      expect.stringContaining('Bạn là một AI chuyên phân tích đúc kết'),
      expect.stringContaining('Bố thích ăn phở tái lăn')
    );
    expect(mockRagService.createKnowledgeDocument).toHaveBeenCalledWith({
      familyId: 'family-1',
      title: expect.stringContaining('Ký ức đúc kết từ hội thoại'),
      content: '- Sở thích ăn uống: Bố thích ăn phở tái lăn.',
      sourceType: 'memory_consolidation',
      metadata: expect.objectContaining({
        sessionId: 'session-1',
        lastMessageCount: 15,
      }),
    });
  });

  it('avoids repeating consolidation if no new messages are written since last consolidation', async () => {
    mockPrisma.chatMessage.count.mockResolvedValue(16);
    mockPrisma.aiDocument.findMany.mockResolvedValue([
      {
        id: 'doc-old',
        title: 'Ký ức cũ',
        metadata: {
          sessionId: 'session-1',
          lastMessageCount: 15, // Already consolidated up to 15 messages
        },
      },
    ]);

    await service.saveMessage('family-1', 'user', 'Câu hỏi thêm mới', 'session-1');

    await new Promise((resolve) => setImmediate(resolve));

    // 16 - 15 = 1 message difference. minMessages = 15. So it shouldn't run.
    expect(mockAiAgentService.generateBriefingText).not.toHaveBeenCalled();
  });

  it('consolidates on cron end of day if active sessions have at least 3 messages', async () => {
    mockPrisma.chatSession.findMany.mockResolvedValue([
      { id: 'session-active', familyId: 'family-1' },
    ]);
    mockPrisma.chatMessage.count.mockResolvedValue(5); // At least 3 for daily cron
    mockPrisma.chatMessage.findMany.mockResolvedValue([
      { role: 'user', content: 'Gia đình mình tuần sau đi du lịch Đà Nẵng nhé.' },
    ]);
    mockAiAgentService.generateBriefingText.mockResolvedValue('- Du lịch: Gia đình đi du lịch Đà Nẵng tuần sau.');

    await service.consolidateAllActiveSessions();

    expect(mockAiAgentService.generateBriefingText).toHaveBeenCalled();
    expect(mockRagService.createKnowledgeDocument).toHaveBeenCalled();
  });
});
