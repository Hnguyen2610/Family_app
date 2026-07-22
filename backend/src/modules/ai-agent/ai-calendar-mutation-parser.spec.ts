import { parseCalendarDate, parseCalendarDateRange, parseCalendarMutation } from './ai-calendar-mutation-parser';

describe('calendar mutation parser', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-07T08:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('parses this Friday in ICT week correctly', () => {
    expect(parseCalendarDate('thu 6 tuan nay')?.iso).toBe('2026-07-10');
  });

  it('parses day-month word date forms correctly', () => {
    expect(parseCalendarDate('ngay 8 thang 7')?.iso).toBe('2026-07-08');
  });

  it('parses day-month word date range forms correctly', () => {
    const range = parseCalendarDateRange('tu ngay 8 den ngay 12 thang 7');
    expect(range?.start?.iso).toBe('2026-07-08');
    expect(range?.end?.iso).toBe('2026-07-12');
  });

  it('parses ngay kia correctly (2 days from today)', () => {
    expect(parseCalendarDate('ngay kia')?.iso).toBe('2026-07-09');
  });

  it('parses event rename requests with old and new titles', () => {
    const parsed = parseCalendarMutation(
      'doi ten su kien 19:30: Su kien - Ca nhan thanh Photo giay xac nhan thuc tap',
      'family-1',
    );

    expect(parsed).toMatchObject({
      action: 'update',
      args: { title: 'Photo giay xac nhan thuc tap' },
      lookup: { title: 'Su kien', time: '19:30' },
    });
  });

  it('allows rename requests without an inline date so recent calendar context can supply it', () => {
    const parsed = parseCalendarMutation(
      'toi muon doi ten su kien Su kien thanh Photo giay xac nhan thuc tap',
      'family-1',
    );

    expect(parsed).toMatchObject({
      action: 'update',
      args: { title: 'Photo giay xac nhan thuc tap' },
      lookup: { title: 'Su kien' },
      needsClarification: undefined,
    });
  });

  it('extracts title from copied calendar event text with date, time, and scope', () => {
    const parsed = parseCalendarMutation(
      'toi muon doi ten Su kien ngay 08/07/2026: 19:30: Su kien - Ca nhan thanh Photo giay xac nhan thuc tap',
      'family-1',
    );

    expect(parsed).toMatchObject({
      action: 'update',
      args: { title: 'Photo giay xac nhan thuc tap' },
      lookup: { title: 'Su kien', date: '2026-07-08', time: '19:30' },
    });
  });

  it('extracts explicit create title without adding the generic event prefix', () => {
    const parsed = parseCalendarMutation(
      'tao lich ngay 8/7 scope ca nhan voi tieu de Lam giay dang ky thuc tap vao luc 19:30',
      'family-1',
    );

    expect(parsed).toMatchObject({
      action: 'create',
      args: {
        title: 'Lam giay dang ky thuc tap',
        date: '2026-07-08',
        time: '19:30',
        scope: 'PRIVATE',
      },
    });
  });

  it('handles accented Vietnamese rename text from chat', () => {
    const parsed = parseCalendarMutation(
      '\u0111\u1ed5i t\u00ean s\u1ef1 ki\u1ec7n Su kien th\u00e0nh Photo gi\u1ea5y x\u00e1c nh\u1eadn th\u1ef1c t\u1eadp',
      'family-1',
    );

    expect(parsed).toMatchObject({
      action: 'update',
      args: { title: 'Photo gi\u1ea5y x\u00e1c nh\u1eadn th\u1ef1c t\u1eadp' },
      lookup: { title: 'Su kien' },
      needsClarification: undefined,
    });
  });
});
