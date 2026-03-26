import { Injectable, Inject, forwardRef, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { calculateLunarDate } from '../../utils/lunar-calendar.util';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(familyId: string, userId: string, dto: CreateEventDto) {
    // Auto-calculate lunar date if not provided
    let lunarDate = dto.lunarDate;
    if (!lunarDate && dto.date) {
      lunarDate = calculateLunarDate(new Date(dto.date));
    }

    // Extract extra fields that shouldn't be spread directly into Prisma data
    const { creatorId, ...eventData } = dto as any;

    const event = await this.prisma.event.create({
      data: {
        ...eventData,
        lunarDate,
        familyId,
        createdBy: userId,
      },
      include: {
        user: {
          select: { name: true, email: true }
        }
      }
    });

    // Send notification if scope is FAMILY or GLOBAL
    if (dto.scope === 'FAMILY' || dto.scope === 'GLOBAL') {
      this.notifyFamily(familyId, event);
    }

    return event;
  }

  private async notifyFamily(familyId: string, event: any) {
    try {
      // Determine which users to notify based on scope
      let usersToNotify: any[] = [];
      
      if (event.scope === 'GLOBAL') {
        // Notify ALL users in the system for global events
        usersToNotify = await this.prisma.user.findMany({
          where: {
            id: { not: event.createdBy } // Exclude creator
          },
          select: { id: true, email: true, notificationSettings: true }
        });
      } else {
        // Notify only family members for FAMILY events
        usersToNotify = await this.prisma.user.findMany({
          where: { 
            familyId,
            id: { not: event.createdBy } // Exclude creator
          },
          select: { id: true, email: true, notificationSettings: true }
        });
      }
      
      const eventType = event.type;
      
      // Filter members based on their granular notification settings
      const filteredMembers = usersToNotify.filter(m => {
        const settings = (m.notificationSettings as any) || {};
        if (Object.keys(settings).length === 0) return true;
        return settings[eventType] !== false;
      });
      
      const emails = filteredMembers.map(m => m.email);
        
      if (emails.length > 0) {
        await this.mailService.sendEventNotificationEmail(emails, {
          title: event.title,
          date: new Date(event.date).toLocaleDateString('vi-VN'),
          description: event.description || undefined,
          creatorName: event.user?.name || 'Thành viên gia đình'
        });
      }

      // Create in-app notifications
      const creatorName = event.user?.name || 'Thành viên gia đình';
      for (const member of filteredMembers) {
        await this.notificationsService.createNotification(member.id, {
          type: eventType,
          title: 'Sự kiện mới',
          message: `${creatorName} đã thêm sự kiện: ${event.title}`,
          metadata: { eventId: event.id, path: '/calendar' }
        });
      }
    } catch (e) {
      console.error('Failed to notify users about event', e);
    }
  }

  async findAll(familyId: string, month?: number, year?: number, userId?: string) {
    let events: any[] = [];
    const hasFamily = familyId && familyId !== 'null' && familyId !== 'undefined' && familyId !== '';

    if (hasFamily) {
      let where: any = { 
        OR: [
          { scope: 'GLOBAL' },
          { familyId, scope: 'FAMILY' },
          { familyId, scope: 'PRIVATE', ...(userId ? { createdBy: userId } : { id: 'none' }) },
        ],
      };
// ... (rest of findAll stays same, cutting for brevity in task but will include in actual call)

      if (month && year) {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);
        where.date = {
          gte: startDate,
          lte: endDate,
        };
      }

      events = await this.prisma.event.findMany({
        where,
        orderBy: { date: 'asc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });
    } else {
      // Unassigned users see all GLOBAL events + system holidays
      let where: any = { scope: 'GLOBAL' };
      events = await this.prisma.event.findMany({ 
        where, 
        include: { user: { select: { id: true, name: true, email: true } } } 
      });
    }

    if (month && year) {
      // Automatically include birthdays as virtual events if familyId exists
      let birthdayEvents: any[] = [];
      if (hasFamily) {
        const usersWithBirthdays = await this.prisma.user.findMany({
          where: {
            familyId,
            birthday: { not: null },
          },
        });

        birthdayEvents = usersWithBirthdays
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
      }

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
            familyId: hasFamily ? familyId : 'system',
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
              familyId: hasFamily ? familyId : 'system',
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

  async findById(id: string, familyId: string, userId?: string) {
    const event = await this.prisma.event.findFirst({
      where: { id, familyId },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!event) return null;

    // If private, only the creator can see it
    if (event.scope === 'PRIVATE' && event.createdBy !== userId) {
      return null;
    }

    return event;
  }

  async update(id: string, familyId: string, userId: string, dto: UpdateEventDto) {
    let lunarDate = dto.lunarDate;
    if (!lunarDate && dto.date) {
      lunarDate = calculateLunarDate(new Date(dto.date));
    }

    const result = await this.prisma.event.updateMany({
      where: { id, familyId: familyId, createdBy: userId },
      data: {
        ...dto,
        lunarDate,
      },
    });

    if (result.count > 0 && dto.scope === 'FAMILY') {
      const updatedEvent = await this.prisma.event.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      });
      if (updatedEvent) {
        this.notifyFamily(familyId, updatedEvent);
      }
    }

    return result;
  }

  async delete(id: string, familyId: string, userId: string) {
    // Check if user has permission (is creator or is admin)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isAdmin = 
      user.globalRole === 'ADMIN' || 
      user.globalRole === 'SUPER_ADMIN' || 
      user.role?.toLowerCase() === 'admin' ||
      user.role?.toLowerCase() === 'super_admin';
    
    // If not admin, the record must have been created by the user
    const where: any = { id, familyId };
    if (!isAdmin) {
      where.createdBy = userId;
    }

    const result = await this.prisma.event.deleteMany({
      where,
    });

    if (result.count === 0) {
      throw new ForbiddenException('Not authorized to delete this event or event not found');
    }

    return result;
  }

  async getEventsByMonth(familyId: string, month: number, year: number, userId?: string) {
    return this.findAll(familyId, month, year, userId);
  }
}
