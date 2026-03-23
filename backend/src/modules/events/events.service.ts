import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { calculateLunarDate } from '../../utils/lunar-calendar.util';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(familyId: string, userId: string, dto: CreateEventDto) {
    // Auto-calculate lunar date if not provided
    let lunarDate = dto.lunarDate;
    if (!lunarDate && dto.date) {
      lunarDate = calculateLunarDate(new Date(dto.date));
    }

    return this.prisma.event.create({
      data: {
        ...dto,
        lunarDate,
        familyId,
        createdBy: userId,
      },
    });
  }

  async findAll(familyId: string, month?: number, year?: number) {
    let where: any = { familyId };

    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { date: 'asc' },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (month && year) {
      // Automatically include birthdays as virtual events
      const usersWithBirthdays = await this.prisma.user.findMany({
        where: {
          familyId,
          birthday: { not: null },
        },
      });

      const birthdayEvents = usersWithBirthdays
        .filter((user) => {
          if (!user.birthday) return false;
          return user.birthday.getUTCMonth() + 1 === month;
        })
        .map((user) => ({
          id: `birthday-${user.id}`,
          title: `🎂 Sinh nhật ${user.name}`,
          description: `Chúc mừng sinh nhật ${user.name}!`,
          date: new Date(year, user.birthday!.getUTCMonth(), user.birthday!.getUTCDate()),
          type: 'BIRTHDAY',
          familyId,
          createdBy: user.id,
          user: { id: user.id, name: user.name, email: user.email },
          createdAt: new Date(),
          updatedAt: new Date(),
        }));

      // Automatically include global holidays
      const solarHolidays = [
        { day: 1, month: 1, title: '🎆 Tết Dương Lịch' },
        { day: 8, month: 3, title: '💐 Quốc tế Phụ nữ' },
        { day: 30, month: 4, title: '🇻🇳 Giải phóng Miền Nam' },
        { day: 1, month: 5, title: '🛠️ Quốc tế Lao động' },
        { day: 2, month: 9, title: '🇻🇳 Quốc khánh' },
        { day: 20, month: 10, title: '👩 Phụ nữ Việt Nam' },
        { day: 20, month: 11, title: '👨‍🏫 Nhà giáo Việt Nam' },
        { day: 24, month: 12, title: '🎄 Giáng sinh' },
      ];

      const lunarHolidays = [
        { day: 1, month: 1, title: '🧨 Tết Nguyên Đán' },
        { day: 10, month: 3, title: '🏺 Giỗ Tổ Hùng Vương' },
        { day: 15, month: 8, title: '🥮 Tết Trung Thu' },
      ];

      const holidayEvents: any[] = [];
      
      // Check solar holidays for current month
      solarHolidays.forEach(h => {
        if (h.month === month) {
          holidayEvents.push({
            id: `holiday-solar-${h.month}-${h.day}`,
            title: h.title,
            description: 'Ngày lễ toàn quốc',
            date: new Date(year, month - 1, h.day),
            type: 'HOLIDAY',
            familyId,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      });

      // Check lunar holidays for every day in the month
      const lastDay = new Date(year, month, 0).getDate();
      for (let d = 1; d <= lastDay; d++) {
        const solarDate = new Date(year, month - 1, d);
        const lunar = calculateLunarDate(solarDate); // Returns "d/m"
        lunarHolidays.forEach(lh => {
          if (lunar === `${lh.day}/${lh.month}`) {
            holidayEvents.push({
              id: `holiday-lunar-${lunar}-${d}`,
              title: lh.title,
              description: 'Ngày lễ Âm lịch',
              date: solarDate,
              type: 'HOLIDAY',
              familyId,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
        });
      }

      return [...events, ...birthdayEvents, ...holidayEvents].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
    }

    return events;
  }

  async findById(id: string, familyId: string) {
    return this.prisma.event.findFirst({
      where: { id, familyId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });
  }

  async update(id: string, familyId: string, dto: UpdateEventDto) {
    let lunarDate = dto.lunarDate;
    if (!lunarDate && dto.date) {
      lunarDate = calculateLunarDate(new Date(dto.date));
    }

    return this.prisma.event.updateMany({
      where: { id, familyId: familyId },
      data: {
        ...dto,
        lunarDate,
      },
    });
  }

  async delete(id: string, familyId: string) {
    return this.prisma.event.deleteMany({
      where: { id, familyId },
    });
  }

  async getEventsByMonth(familyId: string, month: number, year: number) {
    return this.findAll(familyId, month, year);
  }
}
