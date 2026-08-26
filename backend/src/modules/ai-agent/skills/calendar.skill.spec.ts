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

  it('resolveVietnameseDate parses a relative date, a range, and a time', async () => {
    const dateResult = await skill.executeTool('resolveVietnameseDate', {
      text: 'ngay mai luc 9 gio toi',
    }, {
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'ngay mai luc 9 gio toi',
      intent: 'general_chat',
    });
    expect(dateResult.ok).toBe(true);
    expect(dateResult.data.date).toBe('2026-07-08');
    expect(dateResult.data.time).toBe('21:00');

    const rangeResult = await skill.executeTool('resolveVietnameseDate', {
      text: 'tu ngay 11/7 den ngay 14/7',
    }, {
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'tu ngay 11/7 den ngay 14/7',
      intent: 'general_chat',
    });
    expect(rangeResult.ok).toBe(true);
    expect(rangeResult.data.date).toBe('2026-07-11');
    expect(rangeResult.data.endDate).toBe('2026-07-14');
  });

  it('resolveVietnameseDate returns an error when no date is found', async () => {
    const result = await skill.executeTool('resolveVietnameseDate', {
      text: 'xin chao ban',
    }, {
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'xin chao ban',
      intent: 'general_chat',
    });
    expect(result.ok).toBe(false);
  });

  it('tryDirectAnswer still answers a dated calendar query when no intent is set', async () => {
    eventsService.getEventsByMonth.mockResolvedValue([
      { id: 'event-1', title: 'Hop phu huynh', date: new Date('2026-07-08T09:00:00.000Z'), scope: 'FAMILY', familyId: 'family-a', time: '09:00' },
    ]);

    const result = await skill.tryDirectAnswer({
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'ngay 8/7 su kien gi',
      intent: 'general_chat',
    });

    expect(result?.content).toContain('Hop phu huynh');
  });

  it('tryDirectAnswer defers to the model for a bare "what is today\'s date" question (no calendar-object word), even though parseCalendarDate matches "hom nay"', async () => {
    const result = await skill.tryDirectAnswer({
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'hom nay la ngay bao nhieu',
      intent: 'general_chat',
    });

    expect(result).toBeUndefined();
    expect(eventsService.getEventsByMonth).not.toHaveBeenCalled();
  });

  it.each([
    ['lich thi dau bong da hom nay', 'football fixtures'],
    ['lich chieu phim hom nay', 'movie showtimes'],
    ['lich bay hom nay', 'flight schedule'],
  ])('tryDirectAnswer defers to the model for a non-calendar "lich" query (%s), since bare "lich" is not a reliable calendar-object word', async (userMessage) => {
    const result = await skill.tryDirectAnswer({
      userId: 'user-1',
      familyId: 'family-a',
      userMessage,
      intent: 'general_chat',
    });

    expect(result).toBeUndefined();
    expect(eventsService.getEventsByMonth).not.toHaveBeenCalled();
  });

  it('tryDirectAnswer returns undefined for a message with no parseable date/month', async () => {
    const result = await skill.tryDirectAnswer({
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'ban khoe khong',
      intent: 'general_chat',
    });

    expect(result).toBeUndefined();
  });

  it('tryDirectAnswer still defers to the model for a mutation-looking message, even with no intent set', async () => {
    const result = await skill.tryDirectAnswer({
      userId: 'user-1',
      familyId: 'family-a',
      userMessage: 'xoa su kien ngay 8/7',
      intent: 'general_chat',
    });

    expect(result).toBeUndefined();
    expect(eventsService.getEventsByMonth).not.toHaveBeenCalled();
  });
});
