import { parseCalendarDate } from './ai-calendar-mutation-parser';

describe('parseCalendarDate', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('parses this Friday in ICT week correctly', () => {
    expect(parseCalendarDate('thu 6 tuan nay')?.iso).toBe('2026-07-10');
  });
});
