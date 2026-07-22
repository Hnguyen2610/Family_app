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

  it('resolves the pinned family from conversation state for both read- and write-looking intents (no more calendar_query branch)', async () => {
    const readResult = await resolver.buildSkillContext({
      familyId: 'all',
      userMessage: 'hom nay su kien cua toi co gi',
      userId: 'user-1',
      intent: 'calendar_query',
      historyLimit: 0,
      source: 'web',
    });

    // Previously calendar_query short-circuited to `undefined` here to keep the query broad;
    // now every intent falls through the same conversation-state/history resolution path.
    expect(readResult.resolvedFamilyId).toBe('family-b');
    expect(readResult.resolvedFamilyMode).toBe('single');
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

  it('buildSkillContext never auto-populates ragContext/ragSources', async () => {
    const context = await resolver.buildSkillContext({
      familyId: 'family-a',
      userMessage: 'me thich an gi',
      userId: 'user-1',
      intent: 'general_chat',
      historyLimit: 6,
    });

    expect(context.ragContext).toBe('');
    expect(context.ragSources).toEqual([]);
    expect(context.ragQuery).toBeUndefined();
    expect(context.ragMiss).toBe(false);
    expect(ragService.searchFamilyKnowledge).not.toHaveBeenCalled();
  });

  it('gives the same unified disambiguation notice regardless of intent when viewing all families', async () => {
    // No pinned lastSelectedFamilyId and no explicit family name in the message, so both calls
    // land on the "multiple families, nothing resolved" branch and must produce identical context.
    conversationState.getState.mockResolvedValue({});

    const readContext = await resolver.buildSkillContext({
      familyId: 'all',
      userMessage: 'lich thang nay co gi',
      userId: 'user-1',
      intent: 'calendar_query',
      historyLimit: 0,
      source: 'web',
    });
    const writeContext = await resolver.buildSkillContext({
      familyId: 'all',
      userMessage: 'tao lich hop',
      userId: 'user-1',
      intent: 'event_mutation',
      historyLimit: 0,
      source: 'web',
    });

    expect(readContext.resolvedFamilyId).toBeUndefined();
    expect(writeContext.resolvedFamilyId).toBeUndefined();
    expect(readContext.familyContext).toContain('USER IS VIEWING ALL FAMILIES');
    expect(readContext.familyContext).toBe(writeContext.familyContext);
    expect(ragService.searchFamilyKnowledge).not.toHaveBeenCalled();
    expect(readContext.userFamilyIds).toEqual(['family-a', 'family-b']);
  });

  it('populates userFamilyIds with every family the user belongs to when familyId is "all"', async () => {
    conversationState.getState.mockResolvedValue({});

    const context = await resolver.buildSkillContext({
      familyId: 'all',
      userMessage: 'nha minh co ghi chu gi ve sinh nhat khong',
      userId: 'user-1',
      intent: 'general_chat',
      historyLimit: 0,
      source: 'web',
    });

    expect(context.userFamilyIds).toEqual(['family-a', 'family-b']);
  });

  it('leaves userFamilyIds empty when a specific familyId is passed directly (not "all")', async () => {
    const context = await resolver.buildSkillContext({
      familyId: 'family-a',
      userMessage: 'hom nay co gi',
      userId: 'user-1',
      intent: 'calendar_query',
      historyLimit: 0,
      source: 'telegram_group' as any,
    });

    expect(context.userFamilyIds).toEqual([]);
  });
});
