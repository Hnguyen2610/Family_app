import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AiActionProposalService } from './ai-action-proposal.service';

describe('AiActionProposalService', () => {
  const fixedNow = new Date('2026-07-07T08:00:00.000Z');
  let prisma: any;
  let eventsService: any;
  let ragService: any;
  let service: AiActionProposalService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(fixedNow);
    prisma = {
      aiActionProposal: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    eventsService = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    ragService = {
      createKnowledgeDocument: jest.fn(),
    };
    service = new AiActionProposalService(prisma, eventsService, ragService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates a pending proposal with default expiry', async () => {
    const stored = {
      id: 'proposal-1',
      userId: 'user-1',
      familyId: 'family-1',
      source: 'web',
      action: 'create_event',
      payload: { title: 'Team Building' },
      status: 'PENDING',
      expiresAt: new Date('2026-07-07T08:15:00.000Z'),
    };
    prisma.aiActionProposal.create.mockResolvedValue(stored);

    const result = await service.createProposal({
      userId: 'user-1',
      familyId: 'family-1',
      source: 'web',
      action: 'create_event',
      payload: { title: 'Team Building' },
    });

    expect(prisma.aiActionProposal.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        familyId: 'family-1',
        source: 'web',
        action: 'create_event',
        payload: { title: 'Team Building' },
        status: 'PENDING',
        expiresAt: new Date('2026-07-07T08:15:00.000Z'),
      },
    });
    expect(result).toBe(stored);
  });

  it('confirms a pending proposal', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      userId: 'user-1',
      status: 'PENDING',
      expiresAt: new Date('2026-07-07T08:10:00.000Z'),
      action: 'create_task',
      payload: {},
    });
    prisma.aiActionProposal.update.mockResolvedValue({
      id: 'proposal-1',
      status: 'CONFIRMED',
    });

    const result = await service.confirm('proposal-1', 'user-1');

    expect(prisma.aiActionProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: { status: 'CONFIRMED' },
    });
    expect(result.status).toBe('CONFIRMED');
  });

  it('rejects a pending proposal', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      userId: 'user-1',
      status: 'PENDING',
      expiresAt: new Date('2026-07-07T08:10:00.000Z'),
      action: 'create_task',
      payload: {},
    });
    prisma.aiActionProposal.update.mockResolvedValue({
      id: 'proposal-1',
      status: 'REJECTED',
    });

    const result = await service.reject('proposal-1', 'user-1');

    expect(prisma.aiActionProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: { status: 'REJECTED' },
    });
    expect(result.status).toBe('REJECTED');
  });

  it('rejects expired proposals', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      userId: 'user-1',
      status: 'PENDING',
      expiresAt: new Date('2026-07-07T07:59:00.000Z'),
      action: 'create_task',
      payload: {},
    });

    await expect(service.confirm('proposal-1', 'user-1')).rejects.toThrow(BadRequestException);
    expect(prisma.aiActionProposal.update).not.toHaveBeenCalled();
  });

  it('rejects missing proposals', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue(null);

    await expect(service.confirm('proposal-1', 'user-1')).rejects.toThrow(NotFoundException);
  });

  it('executes create_event when confirming a proposal', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      userId: 'user-1',
      familyId: 'family-1',
      status: 'PENDING',
      expiresAt: new Date('2026-07-07T08:10:00.000Z'),
      action: 'create_event',
      payload: {
        toolName: 'createEvent',
        familyId: 'family-1',
        userId: 'user-1',
        args: { title: 'Team Building', date: '2026-07-11', scope: 'PRIVATE' },
      },
    });
    eventsService.create.mockResolvedValue({ id: 'event-1', title: 'Team Building' });
    prisma.aiActionProposal.update.mockResolvedValue({
      id: 'proposal-1',
      status: 'CONFIRMED',
      payload: {
        result: { id: 'event-1', title: 'Team Building' },
      },
    });

    const result = await service.confirm('proposal-1', 'user-1');

    expect(eventsService.create).toHaveBeenCalledWith('family-1', 'user-1', {
      title: 'Team Building',
      date: '2026-07-11',
      scope: 'PRIVATE',
    });
    expect(prisma.aiActionProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: {
        status: 'CONFIRMED',
        payload: {
          toolName: 'createEvent',
          familyId: 'family-1',
          userId: 'user-1',
          args: { title: 'Team Building', date: '2026-07-11', scope: 'PRIVATE' },
          result: { id: 'event-1', title: 'Team Building' },
        },
      },
    });
    expect(result.status).toBe('CONFIRMED');
  });

  it('creates a proposal response from a side-effect tool call', async () => {
    prisma.aiActionProposal.create.mockResolvedValue({
      id: 'proposal-1',
      action: 'create_event',
      payload: {
        toolName: 'createEvent',
        args: { title: 'Team Building' },
        familyId: 'family-1',
        userId: 'user-1',
      },
      status: 'PENDING',
    });

    const result = await service.createToolProposal('createEvent', { title: 'Team Building' }, {
      userId: 'user-1',
      familyId: 'all',
      resolvedFamilyId: 'family-1',
      source: 'telegram',
    } as any);

    expect(prisma.aiActionProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        familyId: 'family-1',
        source: 'telegram',
        action: 'create_event',
        payload: {
          toolName: 'createEvent',
          args: { title: 'Team Building' },
          familyId: 'family-1',
          userId: 'user-1',
        },
        status: 'PENDING',
      }),
    });
    expect(result).toMatchObject({
      type: 'action_proposal',
      proposalId: 'proposal-1',
      action: 'create_event',
      payload: {
        toolName: 'createEvent',
        args: { title: 'Team Building' },
        familyId: 'family-1',
        userId: 'user-1',
      },
    });
  });

  it('corrects create_event proposal date from the user message when the model date is wrong', async () => {
    prisma.aiActionProposal.create.mockResolvedValue({
      id: 'proposal-1',
      action: 'create_event',
      payload: {},
      status: 'PENDING',
    });

    await service.createToolProposal('createEvent', { title: 'Da bong', date: '2026-07-11' }, {
      userId: 'user-1',
      familyId: 'family-1',
      userMessage: 'thu 6 tuan nay',
      source: 'web',
    } as any);

    expect(prisma.aiActionProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        payload: {
          toolName: 'createEvent',
          args: { title: 'Da bong', date: '2026-07-10' },
          familyId: 'family-1',
          userId: 'user-1',
        },
      }),
    });
  });
});
