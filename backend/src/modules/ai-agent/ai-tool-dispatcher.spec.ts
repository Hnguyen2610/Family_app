import { createSkillToolDispatcher, mergeUniqueTools } from './ai-tool-dispatcher';

describe('createSkillToolDispatcher', () => {
  const logger = {
    debug: jest.fn(),
    warn: jest.fn(),
  };
  const tools = [
    {
      type: 'function',
      function: {
        name: 'createEvent',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string' },
          },
          required: ['title'],
        },
      },
    },
  ];
  const context: any = {
    userId: 'user-1',
    familyId: 'family-1',
    userMessage: 'tao lich team building',
    intent: 'event_mutation',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a proposal for side-effect tools instead of executing the skill', async () => {
    const skill = {
      name: 'CalendarSkill',
      executeTool: jest.fn(),
    };
    const toolOwners = new Map<string, any>([['createEvent', skill]]);
    const createActionProposal = jest.fn().mockResolvedValue({
      type: 'action_proposal',
      proposalId: 'proposal-1',
      action: 'create_event',
      payload: { title: 'Team Building' },
      message: 'Confirm before saving',
    });

    const dispatch = createSkillToolDispatcher({
      label: 'ToolDispatch/test',
      logger,
      tools: tools as any,
      toolOwners,
      context,
      baseExecuteTool: jest.fn(),
      shouldAllowSideEffectTool: () => true,
      createActionProposal,
    });

    const result = await dispatch('createEvent', { title: 'Team Building' }, 'family-1', 'user-1');

    expect(createActionProposal).toHaveBeenCalledWith('createEvent', { title: 'Team Building' }, context);
    expect(skill.executeTool).not.toHaveBeenCalled();
    expect(result).toEqual({
      type: 'action_proposal',
      proposalId: 'proposal-1',
      action: 'create_event',
      payload: { title: 'Team Building' },
      message: 'Confirm before saving',
    });
  });
});

describe('createSkillToolDispatcher with tool-owner map', () => {
  it('dispatches a tool call to whichever skill owns that tool name', async () => {
    const calendarSkill: any = { name: 'CalendarSkill', executeTool: jest.fn().mockResolvedValue({ ok: true, tool: 'getEventsByMonth', data: [] }) };
    const knowledgeSkill: any = { name: 'FamilyKnowledgeSkill', executeTool: jest.fn().mockResolvedValue({ ok: true, tool: 'searchFamilyNotes', data: { matches: [] } }) };
    const toolOwners = new Map<string, any>([
      ['getEventsByMonth', calendarSkill],
      ['searchFamilyNotes', knowledgeSkill],
    ]);
    const tools = [
      { type: 'function', function: { name: 'getEventsByMonth', parameters: { type: 'object', properties: {}, required: [] } } },
      { type: 'function', function: { name: 'searchFamilyNotes', parameters: { type: 'object', properties: {}, required: [] } } },
    ];

    const dispatch = createSkillToolDispatcher({
      label: 'Test',
      logger: { debug: () => {}, warn: () => {} },
      tools,
      toolOwners,
      context: {} as any,
      baseExecuteTool: jest.fn(),
      shouldAllowSideEffectTool: () => true,
    });

    await dispatch('searchFamilyNotes', { query: 'x' }, 'family-a', 'user-1');

    expect(knowledgeSkill.executeTool).toHaveBeenCalledWith('searchFamilyNotes', { query: 'x' }, {});
    expect(calendarSkill.executeTool).not.toHaveBeenCalled();
  });

  it('falls back to baseExecuteTool when no skill owns the tool', async () => {
    const baseExecuteTool = jest.fn().mockResolvedValue({ ok: false });
    const dispatch = createSkillToolDispatcher({
      label: 'Test',
      logger: { debug: () => {}, warn: () => {} },
      tools: [{ type: 'function', function: { name: 'unknownTool', parameters: { type: 'object', properties: {}, required: [] } } }] as any,
      toolOwners: new Map(),
      context: {} as any,
      baseExecuteTool,
      shouldAllowSideEffectTool: () => true,
    });

    await dispatch('unknownTool', {}, 'family-a', 'user-1');
    expect(baseExecuteTool).toHaveBeenCalledWith('unknownTool', {}, 'family-a', 'user-1');
  });
});
