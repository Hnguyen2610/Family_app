jest.mock('nodemailer');

import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

describe('MailService.sendCustomEmail', () => {
  const originalEmailUser = process.env.EMAIL_USER;
  const originalEmailPass = process.env.EMAIL_PASS;
  let sendMailMock: jest.Mock;

  beforeEach(() => {
    process.env.EMAIL_USER = 'bot@family.com';
    process.env.EMAIL_PASS = 'secret';
    sendMailMock = jest.fn().mockResolvedValue({ messageId: 'msg-1' });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail: sendMailMock });
  });

  afterEach(() => {
    process.env.EMAIL_USER = originalEmailUser;
    process.env.EMAIL_PASS = originalEmailPass;
  });

  it('gửi email tới đúng địa chỉ với đúng tiêu đề, chèn tên người nhận và nội dung admin nhập', async () => {
    const service = new MailService();

    await service.sendCustomEmail('con@family.com', 'Yến', 'Thông báo quan trọng', 'Nhớ họp gia đình 8h tối nay.');

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('con@family.com');
    expect(call.subject).toBe('Thông báo quan trọng');
    expect(call.html).toContain('Yến');
    expect(call.html).toContain('Nhớ họp gia đình 8h tối nay.');
  });

  it('escape HTML trong nội dung admin nhập để tránh chèn thẻ HTML tùy ý', async () => {
    const service = new MailService();

    await service.sendCustomEmail('con@family.com', 'Yến', 'Test', '<script>alert(1)</script>');

    const call = sendMailMock.mock.calls[0][0];
    expect(call.html).not.toContain('<script>alert(1)</script>');
    expect(call.html).toContain('&lt;script&gt;');
  });
});
