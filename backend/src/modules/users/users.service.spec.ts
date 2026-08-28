import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';

function buildService(user: any) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const mailService = { sendCustomEmail: jest.fn().mockResolvedValue(undefined) };
  const service = new UsersService(prisma as any, mailService as any);
  return { service, prisma, mailService };
}

describe('UsersService.sendCustomEmail', () => {
  it('gửi email tới đúng user với subject/message admin nhập', async () => {
    const { service, mailService } = buildService({ id: 'user-1', name: 'Yến', email: 'yen@family.com' });

    await service.sendCustomEmail('user-1', 'Nhắc nhở', 'Nhớ họp gia đình tối nay.');

    expect(mailService.sendCustomEmail).toHaveBeenCalledWith(
      'yen@family.com',
      'Yến',
      'Nhắc nhở',
      'Nhớ họp gia đình tối nay.',
    );
  });

  it('ném NotFoundException khi userId không tồn tại', async () => {
    const { service } = buildService(null);

    await expect(service.sendCustomEmail('missing', 'Chủ đề', 'Nội dung')).rejects.toThrow(NotFoundException);
  });
});
