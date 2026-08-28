import { getDailyBriefingSignatureLine } from './proactive-notification-settings';

describe('getDailyBriefingSignatureLine', () => {
  it('dùng mặc định "Nguyên" và tên thật của người nhận khi user chưa tự cấu hình', () => {
    const line = getDailyBriefingSignatureLine({}, 'Yến');
    expect(line).toBe('Nguyên yêu Yến');
  });

  it('dùng tên tùy chỉnh trong notificationSettings khi user đã đổi', () => {
    const settings = { dailyBriefingSignature: { fromName: 'Bố', toName: 'Con gái' } };
    const line = getDailyBriefingSignatureLine(settings, 'Yến');
    expect(line).toBe('Bố yêu Con gái');
  });

  it('trả về chuỗi rỗng khi không có tên người nhận nào để dùng', () => {
    const line = getDailyBriefingSignatureLine({}, '');
    expect(line).toBe('');
  });
});
