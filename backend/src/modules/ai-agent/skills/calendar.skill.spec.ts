import { CalendarSkill } from './calendar.skill';

describe('CalendarSkill', () => {
  let eventsService: any;
  let conversationState: any;
  let skill: CalendarSkill;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T08:00:00.000Z'));
    eventsService = {
      getEventsByMonth: jest.fn(),
      create: jest.fn().mockResolvedValue({ id: 'event-new' }),
      update: jest.fn(),
      delete: jest.fn(),
    };
    conversationState = {
      saveState: jest.fn(),
    };
    skill = new CalendarSkill(eventsService, conversationState);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('includes private and visible family events for "cua toi" all-family queries', async () => {
    eventsService.getEventsByMonth.mockResolvedValue([
      { id: 'private-1', title: 'Private task', date: new Date('2026-07-08T09:00:00.000Z'), scope: 'PRIVATE', familyId: 'family-a', time: '16:00' },
      { id: 'family-1', title: 'Family dinner', date: new Date('2026-07-08T10:00:00.000Z'), scope: 'FAMILY', familyId: 'family-b', time: '17:00' },
    ]);

    const result = await skill.tryDirectAnswer({
      userId: 'user-1',
      familyId: 'all',
      userMessage: 'ngay 8/7 su kien cua toi co gi',
      intent: 'calendar_query',
    });

    expect(eventsService.getEventsByMonth).toHaveBeenCalledWith('all', 7, 2026, 'user-1');
    expect(result?.content).toContain('Private task');
    expect(result?.content).toContain('Family dinner');
    expect(conversationState.saveState).toHaveBeenCalledWith('user-1', expect.objectContaining({
      lastShownEvents: expect.arrayContaining([
        expect.objectContaining({ eventId: 'private-1', rowNumber: 1 }),
        expect.objectContaining({ eventId: 'family-1', rowNumber: 2 }),
      ]),
    }));
  });

  it('passes endDate through createEvent for range event execution', async () => {
    await skill.executeTool('createEvent', {
      title: 'Team Building',
      date: '2026-07-11',
      endDate: '2026-07-14',
      time: '09:00',
      scope: 'FAMILY',
    }, {
      userId: 'user-1',
      familyId: 'family-a',
      resolvedFamilyId: 'family-a',
      userMessage: 'tu 11/7 den 14/7 Team Building',
      intent: 'event_mutation',
    });

    expect(eventsService.create).toHaveBeenCalledWith('family-a', 'user-1', expect.objectContaining({
      title: 'Team Building',
      date: new Date('2026-07-11T02:00:00.000Z'),
      endDate: new Date('2026-07-14T00:00:00.000Z'),
    }));
  });
});
