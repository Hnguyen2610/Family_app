import { AiFamilyResolver } from './ai-family-resolver';

describe('AiFamilyResolver', () => {
  let prisma: any;
  let chatService: any;
  let ragService: any;
  let conversationState: any;
  let resolver: AiFamilyResolver;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          name: 'Tester',
          role: 'member',
          notificationSettings: {},
          mealPreferences: [],
          familyId: 'family-a',
          family: { id: 'family-a', name: 'Gia dinh A', users: [] },
          families: [
            { id: 'family-a', name: 'Gia dinh A', users: [] },
            { id: 'family-b', name: 'Gia dinh B', users: [] },
          ],
        }),
      },
    };
    chatService = {
      getHistory: jest.fn().mockResolvedValue([]),
    };
    ragService = {
      searchFamilyKnowledge: jest.fn().mockResolvedValue([]),
      formatRagContext: jest.fn().mockReturnValue(''),
    };
    conversationState = {
      getState: jest.fn().mockResolvedValue({ lastSelectedFamilyId: 'family-b' }),
    };
    resolver = new AiFamilyResolver(prisma, chatService, ragService, conversationState);
  });

  it('keeps all-family mode for calendar queries instead of pinning the last selected family', async () => {
    const result = await resolver.buildSkillContext({
      familyId: 'all',
      userMessage: 'hom nay su kien cua toi co gi',
      userId: 'user-1',
      intent: 'calendar_query',
      historyLimit: 0,
      source: 'web',
    });

    expect(result.resolvedFamilyId).toBeUndefined();
    expect(result.resolvedFamilyMode).toBe('all');
  });

  it('reuses the last selected family for event mutations in all-family mode', async () => {
    const result = await resolver.buildSkillContext({
      familyId: 'all',
      userMessage: 'doi ten su kien nay thanh Team Building',
      userId: 'user-1',
      intent: 'event_mutation',
      historyLimit: 0,
      source: 'web',
    });

    expect(result.resolvedFamilyId).toBe('family-b');
    expect(result.resolvedFamilyMode).toBe('single');
  });

  it('marks telegram group requests with telegram_group family mode', async () => {
    const result = await resolver.buildSkillContext({
      familyId: 'family-a',
      userMessage: 'hom nay co gi',
      userId: 'user-1',
      intent: 'calendar_query',
      historyLimit: 0,
      source: 'telegram_group' as any,
    });

    expect(result.resolvedFamilyMode).toBe('telegram_group');
  });

  it('searches RAG across all user families in all-family read mode', async () => {
    conversationState.getState.mockResolvedValueOnce({});
    ragService.searchFamilyKnowledge
      .mockResolvedValueOnce([{ documentId: 'doc-a', title: 'A', content: 'A info', chunkIndex: 0, score: 0.7, familyId: 'family-a' }])
      .mockResolvedValueOnce([{ documentId: 'doc-b', title: 'B', content: 'B info', chunkIndex: 0, score: 0.9, familyId: 'family-b' }]);

    const result = await resolver.buildSkillContext({
      familyId: 'all',
      userMessage: 'so tay nha minh co gi ve sinh nhat',
      userId: 'user-1',
      intent: 'family_knowledge',
      historyLimit: 0,
      source: 'web',
    });

    expect(ragService.searchFamilyKnowledge).toHaveBeenCalledWith('family-a', expect.any(String), 3);
    expect(ragService.searchFamilyKnowledge).toHaveBeenCalledWith('family-b', expect.any(String), 3);
    expect(result.ragSources?.[0].documentId).toBe('doc-b');
  });
});
