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

    // Send notification based on scope
    if (dto.scope === 'FAMILY' || dto.scope === 'GLOBAL') {
      this.notifyFamily(familyId, event);
    } else if (dto.scope === 'PRIVATE' && event.user?.email) {
      // Send confirmation email to the creator for private events
      this.mailService.sendEventNotificationEmail([event.user.email], {
        title: event.title,
        date: new Date(event.date).toLocaleDateString('vi-VN'),
        description: event.description || undefined,
        creatorName: event.user?.name || 'Bạn',
      }).catch(e => console.error('Failed to send private event email', e));
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
            families: { some: { id: familyId } },
            id: { not: event.createdBy } // Exclude creator
          },
          select: { id: true, email: true, notificationSettings: true }
        });
      }
      
      const eventType = event.type;
      
      // Filter members based on their granular notification settings
      const filteredMembers = usersToNotify.filter(m => {
        const settings = (m.notificationSettings) || {};
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
    const isAll = familyId === 'all';
    const hasFamily = familyId && familyId !== 'null' && familyId !== 'undefined' && familyId !== '' && !isAll;

    // To provide family names when viewing all
    const familiesMap: Record<string, string> = {};

    if (isAll && userId) {
      events = await this.findAllForUserFamilies(userId, month, year);
    } else if (hasFamily) {
      const family = await this.prisma.family.findUnique({ where: { id: familyId } });
      const familyName = family?.name || 'Gia đình';

      const where: any = {
        OR: [
          { scope: 'GLOBAL' },
          { familyId, scope: 'FAMILY' },
          { familyId, scope: 'PRIVATE', ...(userId ? { createdBy: userId } : { id: 'none' }) },
        ],
      };

      if (month && year) {
        where.date = {
          gte: new Date(year, month - 1, 1),
          lte: new Date(year, month, 0),
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

      events = events.map((e) => ({ ...e, familyName: e.scope === 'GLOBAL' ? 'Hệ thống' : familyName }));
    } else {
      // Unassigned users see all GLOBAL events + system holidays
      const where: any = { scope: 'GLOBAL' };
      events = await this.prisma.event.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      events = events.map((e) => ({ ...e, familyName: 'Hệ thống' }));
    }

    if (month && year) {
      const birthdayEvents = await this.getBirthdayEvents(isAll ? 'all' : familyId, month, year, userId);
      const holidayEvents = await this.getHolidayEvents(month, year, hasFamily ? familyId : 'system');

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

    const { creatorId: _c, familyId: _f, ...updateData } = dto as any;
    const result = await this.prisma.event.updateMany({
      where: { id, familyId: familyId, createdBy: userId },
      data: {
        ...updateData,
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

  private async findAllForUserFamilies(userId: string, month?: number, year?: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { families: { select: { id: true, name: true } } },
    });
    
    const familiesMap: Record<string, string> = {};
    const familyIds = user?.families.map((f) => f.id) || [];
    user?.families.forEach((f) => (familiesMap[f.id] = f.name));

    const where: any = {
      OR: [
        { scope: 'GLOBAL' },
        { familyId: { in: familyIds }, scope: 'FAMILY' },
        { createdBy: userId, scope: 'PRIVATE' },
      ],
    };

    if (month && year) {
      where.date = {
        gte: new Date(year, month - 1, 1),
        lte: new Date(year, month, 0),
      };
    }

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    return events.map((e) => ({
      ...e,
      familyName: familiesMap[e.familyId] || (e.scope === 'GLOBAL' ? 'Hệ thống' : 'Cá nhân'),
    }));
  }

  async getEventsByMonth(familyId: string, month: number, year: number, userId?: string) {
    return this.findAll(familyId, month, year, userId);
  }

  private async getBirthdayEvents(familyId: string, month: number, year: number, userId?: string): Promise<any[]> {
    const isAll = familyId === 'all';
    let familyIds: string[] = [];

    if (isAll && userId) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { families: { select: { id: true } } },
      });
      familyIds = user?.families.map(f => f.id) || [];
    } else if (familyId !== 'all' && familyId !== 'system' && familyId !== '') {
      familyIds = [familyId];
    } else {
      return [];
    }

    const usersWithBirthdays = await this.prisma.user.findMany({
      where: {
        families: { some: { id: { in: familyIds } } },
        birthday: { not: null },
      },
      include: { families: { select: { id: true, name: true } } }
    });

    return usersWithBirthdays
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
        familyId: user.families[0]?.id,
        familyName: user.families[0]?.name || 'Gia đình',
        createdBy: user.id,
        user: { id: user.id, name: user.name, email: user.email },
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
  }

  private async getHolidayEvents(month: number, year: number, familyId: string): Promise<any[]> {
    const solarHolidays = [
      { day: 1, month: 1, title: '🎆 Tết Dương Lịch' },
      { day: 14, month: 2, title: '💘 Lễ Tình Nhân (Valentine)' },
      { day: 8, month: 3, title: '💐 Quốc tế Phụ nữ' },
      { day: 26, month: 3, title: '🛡️ Ngày Thành lập Đoàn' },
      { day: 30, month: 4, title: '🇻🇳 Giải phóng Miền Nam' },
      { day: 1, month: 5, title: '🛠️ Quốc tế Lao động' },
      { day: 15, month: 5, title: '🪁 Ngày thành lập Đội' },
      { day: 19, month: 5, title: '🎂 Ngày sinh Bác Hồ' },
      { day: 1, month: 6, title: '🎈 Quốc tế Thiếu nhi' },
      { day: 28, month: 6, title: '🏠 Ngày Gia đình Việt Nam' },
      { day: 27, month: 7, title: '🕯️ Ngày Thương binh Liệt sĩ' },
      { day: 19, month: 8, title: '🔥 Cách mạng Tháng Tám' },
      { day: 2, month: 9, title: '🇻🇳 Quốc khánh' },
      { day: 10, month: 10, title: '🏘️ Giải phóng Thủ đô' },
      { day: 20, month: 10, title: '👩 Phụ nữ Việt Nam' },
      { day: 20, month: 11, title: '👨‍🏫 Nhà giáo Việt Nam' },
      { day: 22, month: 12, title: '🎖️ Ngày thành lập Quân đội' },
      { day: 24, month: 12, title: '🎄 Giáng sinh' },
      { day: 31, month: 12, title: '🎇 Giao thừa Dương lịch' },
    ];

    const lunarHolidays = [
      { day: 1, month: 1, title: '🧨 Mùng 1 Tết Nguyên Đán' },
      { day: 2, month: 1, title: '🧨 Mùng 2 Tết' },
      { day: 3, month: 1, title: '🧨 Mùng 3 Tết' },
      { day: 15, month: 1, title: '🏮 Rằm tháng Giêng' },
      { day: 3, month: 3, title: '🥟 Tết Hàn Thực' },
      { day: 10, month: 3, title: '🏺 Giỗ Tổ Hùng Vương' },
      { day: 15, month: 4, title: '☸️ Lễ Phật Đản' },
      { day: 5, month: 5, title: '🌾 Tết Đoan Ngọ' },
      { day: 15, month: 7, title: '👻 Lễ Vu Lan / Xá tội vong nhân' },
      { day: 15, month: 8, title: '🥮 Tết Trung Thu' },
      { day: 23, month: 12, title: '🐠 Tết Ông Công Ông Táo' },
    ];

    const holidayEvents: any[] = [];
    
    // Solar holidays
    solarHolidays.forEach(h => {
      if (h.month === month) {
        holidayEvents.push({
          id: `holiday-solar-${h.month}-${h.day}`,
          title: h.title,
          description: 'Ngày lễ Dương lịch',
          date: new Date(year, month - 1, h.day),
          type: 'HOLIDAY',
          familyId,
          familyName: 'Hệ thống',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    // Lunar holidays
    const lastDay = new Date(year, month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      const solarDate = new Date(year, month - 1, d);
      const lunar = calculateLunarDate(solarDate);
      lunarHolidays.forEach(lh => {
        if (lunar === `${lh.day}/${lh.month}`) {
          holidayEvents.push({
            id: `holiday-lunar-${lunar}-${d}`,
            title: lh.title,
            description: 'Ngày lễ Âm lịch',
            date: solarDate,
            type: 'HOLIDAY',
            familyId,
            familyName: 'Hệ thống',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        }
      });

      // Giao Thừa
      const nextDay = new Date(solarDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextLunar = calculateLunarDate(nextDay);
      if (nextLunar === '1/1') {
        holidayEvents.push({
          id: `holiday-lunar-nye-${d}`,
          title: '🎆 Giao thừa Âm lịch',
          description: 'Thời khắc chuyển giao năm mới',
          date: solarDate,
          type: 'HOLIDAY',
          familyId,
          familyName: 'Hệ thống',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    return holidayEvents;
  }
}
