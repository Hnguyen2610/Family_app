import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    const data: any = { ...dto };
    if (dto.birthday) {
      data.birthday = new Date(dto.birthday);
    }
    return this.prisma.user.create({
      data,
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
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async delete(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
