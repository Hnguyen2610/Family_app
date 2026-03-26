import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';
import { MailService } from '../mail/mail.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
  ) {}

  async create(dto: CreateUserDto) {
    const data: any = { ...dto };
    if (dto.birthday) {
      data.birthday = new Date(dto.birthday);
    }
    const user = await this.prisma.user.create({
      data,
    });

    // Send Welcome Email
    this.mailService.sendWelcomeEmail(user.email, user.name).catch(err => 
      console.error('Failed to send welcome email', err)
    );

    return user;
  }

  async findAllGlobal() {
    return this.prisma.user.findMany({
      include: {
        family: true,
      },
    });
  }

  async findAll(familyId: string) {
    return this.prisma.user.findMany({
      where: { familyId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        globalRole: true,
        birthday: true,
        familyId: true,
        createdAt: true,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        globalRole: true,
        birthday: true,
        familyId: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const data: any = { ...dto };
    if (dto.birthday) {
      data.birthday = new Date(dto.birthday);
    }

    const oldUser = await this.prisma.user.findUnique({
      where: { id },
      include: { family: true }
    });

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { family: true }
    });

    // Send Family Added Email if familyId was just added or changed
    if (dto.familyId && dto.familyId !== oldUser?.familyId) {
      const family = await this.prisma.family.findUnique({ where: { id: dto.familyId } });
      if (family) {
        this.mailService.sendFamilyAddedEmail(user.email, user.name, family.name).catch(err => 
          console.error('Failed to send family added email', err)
        );
      }
    }

    return user;
  }

  async delete(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
