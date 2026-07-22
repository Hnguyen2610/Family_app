import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      event: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
      },
    };
    eventsService = {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };
    ragService = {
      createKnowledgeDocument: jest.fn(),
      updateKnowledgeDocument: jest.fn(),
      findDuplicateKnowledgeDocument: jest.fn(),
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
        targetType: undefined,
        targetId: undefined,
        riskLevel: 'low',
        requiresConfirmation: true,
        before: undefined,
        after: undefined,
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
    expect(prisma.aiActionProposal.update).toHaveBeenCalledWith({
      where: { id: 'proposal-1' },
      data: { status: 'EXPIRED' },
    });
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

  it('rejects duplicate pending proposals for the same event target', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue({
      id: 'proposal-existing',
      status: 'PENDING',
      targetId: 'event-1',
    });

    await expect(service.createToolProposal('updateEvent', { id: 'event-1', title: 'Title moi' }, {
      userId: 'user-1',
      familyId: 'family-1',
      source: 'web',
    } as any)).rejects.toThrow(BadRequestException);
  });

  it('raises a permission-specific error when confirming a proposal for an event the user cannot mutate', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue({
      id: 'proposal-1',
      userId: 'user-1',
      familyId: 'family-1',
      status: 'PENDING',
      expiresAt: new Date('2026-07-07T08:10:00.000Z'),
      action: 'delete_event',
      targetId: 'event-1',
      payload: {
        toolName: 'deleteEvent',
        familyId: 'family-1',
        userId: 'user-1',
        args: { id: 'event-1' },
      },
    });
    prisma.event.findFirst.mockResolvedValue({
      id: 'event-1',
      familyId: 'family-1',
      createdBy: 'user-2',
      scope: 'PRIVATE',
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      globalRole: 'USER',
      role: 'member',
    });

    await expect(service.confirm('proposal-1', 'user-1')).rejects.toThrow(ForbiddenException);
  });

  it('turns duplicate family notes into a merge proposal instead of a blind create', async () => {
    ragService.findDuplicateKnowledgeDocument.mockResolvedValue({
      id: 'doc-1',
      title: 'So thich cua me',
      content: 'Me thich bun bo.',
      mergedContent: 'Me thich bun bo.\n\nMe cung thich pho.',
      metadata: { category: 'profile' },
    });
    prisma.aiActionProposal.create.mockResolvedValue({
      id: 'proposal-note-1',
      action: 'save_note',
      payload: {},
      status: 'PENDING',
    });

    const result = await service.createToolProposal('createWikiEntry', {
      title: 'So thich cua me',
      content: 'Me cung thich pho.',
    }, {
      userId: 'user-1',
      familyId: 'family-1',
      source: 'web',
    } as any);

    expect(prisma.aiActionProposal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'save_note',
        targetId: 'doc-1',
        before: expect.objectContaining({
          title: 'So thich cua me',
          content: 'Me thich bun bo.',
        }),
        after: expect.objectContaining({
          title: 'So thich cua me',
          content: 'Me thich bun bo.\n\nMe cung thich pho.',
        }),
      }),
    });
    expect(result.summary).toContain('merge');
  });

  it('updates the existing family note when a duplicate-merge proposal is confirmed', async () => {
    prisma.aiActionProposal.findFirst.mockResolvedValue({
      id: 'proposal-note-1',
      userId: 'user-1',
      familyId: 'family-1',
      status: 'PENDING',
      expiresAt: new Date('2026-07-07T08:10:00.000Z'),
      action: 'save_note',
      targetId: 'doc-1',
      payload: {
        toolName: 'createWikiEntry',
        familyId: 'family-1',
        userId: 'user-1',
        args: {
          title: 'So thich cua me',
          content: 'Me cung thich pho.',
          documentId: 'doc-1',
          mergeStrategy: 'merge_duplicate',
          mergedContent: 'Me thich bun bo.\n\nMe cung thich pho.',
        },
      },
    });
    ragService.updateKnowledgeDocument.mockResolvedValue({ id: 'doc-1' });
    prisma.aiActionProposal.update.mockResolvedValue({
      id: 'proposal-note-1',
      status: 'CONFIRMED',
      payload: {},
    });

    await service.confirm('proposal-note-1', 'user-1');

    expect(ragService.updateKnowledgeDocument).toHaveBeenCalledWith('family-1', 'doc-1', {
      title: 'So thich cua me',
      content: 'Me thich bun bo.\n\nMe cung thich pho.',
      metadata: {},
    });
  });

  // ── Self-Reflective Planner ────────────────────────────────────────────────

  describe('Self-Reflective Planner (schedule conflict detection)', () => {
    const mockContext = {
      userId: 'user-1',
      familyId: 'family-1',
      resolvedFamilyId: 'family-1',
      source: 'web',
    } as any;

    beforeEach(() => {
      prisma.aiActionProposal.create.mockResolvedValue({
        id: 'proposal-1',
        action: 'create_event',
        payload: {},
        status: 'PENDING',
      });
      prisma.aiActionProposal.findFirst.mockResolvedValue(null); // no duplicate pending
    });

    it('detects a time conflict and embeds warning + alternative slots in summary', async () => {
      // Existing event at 09:00
      eventsService.getEventsByMonth = jest.fn().mockResolvedValue([
        { id: 'e-1', title: 'Họp team', date: '2026-07-11T00:00:00Z', time: '09:00', scope: 'FAMILY' },
      ]);

      const result = await service.createToolProposal(
        'createEvent',
        { title: 'Gặp khách hàng', date: '2026-07-11', time: '09:30' },
        mockContext,
      );

      expect(result.conflictDetected).toBe(true);
      expect(result.summary).toContain('Phát hiện xung đột');
      expect(result.summary).toContain('Họp team');
      expect(result.summary).toContain('09:00');
      // alternative slots should be suggested
      expect(result.summary).toMatch(/Gợi ý slot trống|Không tìm được slot trống/);
    });

    it('suggests valid alternative slots within business hours when conflict is found', async () => {
      // Block 09:00 and 10:00 to test edge
      eventsService.getEventsByMonth = jest.fn().mockResolvedValue([
        { id: 'e-1', title: 'A', date: '2026-07-11T00:00:00Z', time: '09:00', scope: 'FAMILY' },
        { id: 'e-2', title: 'B', date: '2026-07-11T00:00:00Z', time: '10:00', scope: 'FAMILY' },
      ]);

      const result = await service.createToolProposal(
        'createEvent',
        { title: 'New meeting', date: '2026-07-11', time: '09:00' },
        mockContext,
      );

      expect(result.conflictDetected).toBe(true);
      // At least one alternative should be suggested (07:30 or 11:00, etc.)
      const hasAlternative = result.summary.includes('Gợi ý slot') || result.summary.includes('Không tìm');
      expect(hasAlternative).toBe(true);
    });

    it('does NOT flag a conflict when proposed slot is free', async () => {
      // Existing event far away from proposed time
      eventsService.getEventsByMonth = jest.fn().mockResolvedValue([
        { id: 'e-1', title: 'Buổi trưa', date: '2026-07-11T00:00:00Z', time: '12:00', scope: 'FAMILY' },
      ]);

      const result = await service.createToolProposal(
        'createEvent',
        { title: 'Chạy bộ', date: '2026-07-11', time: '07:00' },
        mockContext,
      );

      expect(result.conflictDetected).toBe(false);
      expect(result.summary).not.toContain('xung đột');
    });

    it('skips conflict check for all-day events without a time field', async () => {
      eventsService.getEventsByMonth = jest.fn().mockResolvedValue([
        { id: 'e-1', title: 'Holiday', date: '2026-07-11T00:00:00Z', time: '09:00', scope: 'FAMILY' },
      ]);

      const result = await service.createToolProposal(
        'createEvent',
        // No time → all-day event
        { title: 'Ngày nghỉ', date: '2026-07-11' },
        mockContext,
      );

      expect(result.conflictDetected).toBe(false);
      expect(eventsService.getEventsByMonth).not.toHaveBeenCalled();
    });

    it('fails open gracefully when DB throws during conflict check', async () => {
      eventsService.getEventsByMonth = jest.fn().mockRejectedValue(new Error('DB timeout'));

      const result = await service.createToolProposal(
        'createEvent',
        { title: 'Test', date: '2026-07-11', time: '09:00' },
        mockContext,
      );

      // Should still create a proposal, not crash
      expect(result.type).toBe('action_proposal');
      expect(result.conflictDetected).toBe(false);
    });
  });
});
