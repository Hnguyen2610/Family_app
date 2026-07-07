import { createSkillToolDispatcher } from './ai-tool-dispatcher';

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
      skill,
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
