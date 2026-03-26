import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(name: string) {
    return this.prisma.family.create({
      data: { name },
    });
  }

  async findAll() {
    return this.prisma.family.findMany({
      include: {
        _count: {
          select: { users: true },
        },
      },
    });
  }

  async findById(id: string) {
    return this.prisma.family.findUnique({
      where: { id },
      include: { users: true },
    });
  }

  async update(id: string, name: string) {
    return this.prisma.family.update({
      where: { id },
      data: { name },
    });
  }

  async delete(id: string) {
    return this.prisma.family.delete({
      where: { id },
    });
  }
}
