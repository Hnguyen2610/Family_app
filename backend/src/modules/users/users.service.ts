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
    const { familyIds, ...rest } = dto;
    const data: any = { ...rest };
    if (dto.birthday) {
      data.birthday = new Date(dto.birthday);
    }
    
    if (familyIds && familyIds.length > 0) {
      data.families = {
        connect: familyIds.map(id => ({ id }))
      };
      // For legacy compatibility
      data.familyId = familyIds[0];
    }

    const user = await this.prisma.user.create({
      data,
      include: { families: true }
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
        families: true,
        family: true, // legacy
      },
    });
  }

  async findAll(familyId: string) {
    return this.prisma.user.findMany({
      where: { 
        families: {
          some: { id: familyId }
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        globalRole: true,
        birthday: true,
        familyId: true, // legacy
        families: true,
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
        familyId: true, // legacy
        families: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto) {
    const { familyIds, ...rest } = dto;
    const data: any = { ...rest };
    if (dto.birthday) {
      data.birthday = new Date(dto.birthday);
    }

    if (familyIds) {
      data.families = {
        set: familyIds.map(id => ({ id }))
      };
      // Keep legacy column sync'd with first family
      data.familyId = familyIds.length > 0 ? familyIds[0] : null;
    }

    const oldUser = await this.prisma.user.findUnique({
      where: { id },
      include: { families: true }
    });

    const user = await this.prisma.user.update({
      where: { id },
      data,
      include: { families: true }
    });

    // Send Family Added Email if familyIds changed
    const oldIds = oldUser?.families.map(f => f.id) || [];
    const newIds = familyIds || [];
    const addedIds = newIds.filter(id => !oldIds.includes(id));

    for (const familyId of addedIds) {
      const family = await this.prisma.family.findUnique({ where: { id: familyId } });
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
