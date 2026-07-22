import { AiEntityResolver } from './ai-entity-resolver';

describe('AiEntityResolver', () => {
  let prisma: any;
  let stateService: any;
  let resolver: AiEntityResolver;

  beforeEach(() => {
    prisma = {
      event: { findMany: jest.fn().mockResolvedValue([]) },
      dailyTask: { findMany: jest.fn().mockResolvedValue([]) },
    };
    stateService = {
      getState: jest.fn(),
    };
    resolver = new AiEntityResolver(prisma, stateService);
  });

  it('resolves a listed task by row number from conversation state', async () => {
    stateService.getState.mockResolvedValue({
      lastShownTasks: [
        { taskId: 'task-1', title: 'Lam giay xac nhan', priority: 1, rowNumber: 1 },
      ],
    });

    const result = await (resolver as any).resolveTask('user-1', 'danh dau xong dong 1');

    expect(result.resolved).toMatchObject({
      id: 'task-1',
      type: 'task',
      title: 'Lam giay xac nhan',
      resolverType: 'row_number',
    });
  });

  it('returns resolver telemetry for an auto-resolved event', async () => {
    stateService.getState.mockResolvedValue({
      lastShownEvents: [
        {
          eventId: 'event-1',
          title: 'Team Building',
          date: '2026-07-11',
          scope: 'FAMILY',
          familyId: 'family-1',
          rowNumber: 1,
        },
      ],
    });

    const result = await resolver.resolveEvent('user-1', 'sua dong 1', 'family-1');

    expect(result.telemetry).toEqual({
      resolverType: 'row_number',
      candidateCount: 1,
      confidence: 0.95,
      selectedEntityId: 'event-1',
    });
  });
});
