import { Injectable, Inject, forwardRef, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { calculateLunarDate, getLunarDateObject, getSolarDateFromLunar } from '../../utils/lunar-calendar.util';
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
    const { creatorId: _c, familyId: _f, ...eventData } = dto as any;

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

    if (isAll && userId) {
      events = await this.findAllForUserFamilies(userId, month, year);
    } else if (hasFamily) {
      const family = await this.prisma.family.findUnique({ where: { id: familyId } });
      const familyName = family?.name || 'Gia đình';

      const startOfMonth = month && year ? new Date(year, month - 1, 1) : null;
      const endOfMonth = month && year ? new Date(year, month, 0, 23, 59, 59) : null;

      const where: any = {
        AND: [
          {
            OR: [
              { scope: 'GLOBAL' },
              { familyId, scope: 'FAMILY' },
              { familyId, scope: 'PRIVATE' },
            ],
          }
        ]
      };

      // Add conditional filters to where.AND[0].OR
      // If private, ensure user owns it
      if (userId) {
        // userId is provided, we can filter correctly
      }

      const eventsResult = await this.prisma.event.findMany({
        where,
        orderBy: { date: 'asc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      // Map and filter by scope/user access manually to simplify query
      events = eventsResult
        .filter(e => {
          if (e.scope === 'PRIVATE' && e.createdBy !== userId) return false;
          if (e.familyId !== familyId && e.scope !== 'GLOBAL') return false;
          return true;
        })
        .map((e) => ({ ...e, familyName: e.scope === 'GLOBAL' ? 'Hệ thống' : familyName }));

      // Expand recurring and filter by date
      if (month && year) {
        events = this.expandRecurringEvents(events, month, year);
      }
    } else {
      const where: any = { scope: 'GLOBAL' };
      events = await this.prisma.event.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
      });
      events = events.map((e) => ({ ...e, familyName: 'Hệ thống' }));

      if (month && year) {
        events = this.expandRecurringEvents(events, month, year);
      }
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

  private expandRecurringEvents(events: any[], month: number, year: number): any[] {
    const expanded: any[] = [];
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    for (const event of events) {
      if (!event.isRecurring) {
        // Keep non-recurring events if they are in the month
        const d = new Date(event.date);
        if (d >= startOfMonth && d <= endOfMonth) {
          expanded.push(event);
        }
        continue;
      }

      // Handle Recurring Events
      const startDate = new Date(event.date);
      if (startDate > endOfMonth) continue; // Not started yet

      const type = event.recurring?.toUpperCase() || 'NONE';

      if (type === 'WEEKLY') {
        const current = new Date(startDate);
        while (current < startOfMonth) {
          current.setDate(current.getDate() + 7);
        }
        while (current <= endOfMonth) {
          expanded.push({
            ...event,
            id: `${event.id}_${current.getTime()}`,
            date: new Date(current),
            isInstance: true,
            originalId: event.id
          });
          current.setDate(current.getDate() + 7);
        }
      } else if (type === 'MONTHLY') {
        const dayOfMonth = startDate.getDate();
        const instanceDate = new Date(year, month - 1, dayOfMonth);
        if (instanceDate.getDate() === dayOfMonth && instanceDate >= startDate && instanceDate <= endOfMonth) {
           expanded.push({
            ...event,
            id: `${event.id}_${instanceDate.getTime()}`,
            date: instanceDate,
            isInstance: true,
            originalId: event.id
          });
        }
      } else if (type === 'LUNAR_MONTHLY') {
        // Find solar date in target month where lunar day matches the original lunar day
        const originalLunarDay = event.lunarDate?.split('/')[0];
        if (originalLunarDay) {
          const lDay = parseInt(originalLunarDay, 10);
          for (let d = new Date(startOfMonth); d <= endOfMonth; d.setDate(d.getDate() + 1)) {
            const lDate = getLunarDateObject(d);
            if (lDate.day === lDay && d >= startDate) {
              expanded.push({
                ...event,
                id: `${event.id}_${d.getTime()}`,
                date: new Date(d),
                isInstance: true,
                originalId: event.id,
                lunarDate: `${lDate.day}/${lDate.month}`
              });
            }
          }
        }
      } else if (type === 'YEARLY') {
        if (startDate.getMonth() === month - 1) {
          const instanceDate = new Date(year, month - 1, startDate.getDate());
          if (instanceDate >= startDate && instanceDate <= endOfMonth) {
            expanded.push({
              ...event,
              id: `${event.id}_${instanceDate.getTime()}`,
              date: instanceDate,
              isInstance: true,
              originalId: event.id
            });
          }
        }
      } else if (type === 'LUNAR_YEARLY') {
        // Find solar date in target year where lunar day/month matches the original lunar date
        const parts = event.lunarDate?.split('/');
        if (parts && parts.length >= 2) {
          const lDay = parseInt(parts[0], 10);
          const lMonth = parseInt(parts[1], 10);
          const solarDate = getSolarDateFromLunar(lDay, lMonth, year);
          if (solarDate && solarDate >= startDate && solarDate >= startOfMonth && solarDate <= endOfMonth) {
            expanded.push({
              ...event,
              id: `${event.id}_${solarDate.getTime()}`,
              date: solarDate,
              isInstance: true,
              originalId: event.id,
              lunarDate: `${lDay}/${lMonth}`
            });
          }
        }
      } else {
        if (startDate >= startOfMonth && startDate <= endOfMonth) {
          expanded.push(event);
        }
      }
    }

    return expanded;
  }

  async findById(id: string, familyId: string, userId?: string) {
    // If it's a virtual ID from a recurring instance, get the base ID
    const baseId = id.split('_')[0];
    const event = await this.prisma.event.findFirst({
      where: { id: baseId, familyId },
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
    const baseId = id.split('_')[0];
    let lunarDate = dto.lunarDate;
    if (!lunarDate && dto.date) {
      lunarDate = calculateLunarDate(new Date(dto.date));
    }

    const { creatorId: _c, familyId: _f, useLunar: _u, ...updateData } = dto as any;

    // Check if user has permission (is creator or is admin)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isAdmin = 
      user.globalRole === 'ADMIN' || 
      user.globalRole === 'SUPER_ADMIN' || 
      user.role?.toLowerCase() === 'admin' ||
      user.role?.toLowerCase() === 'super_admin';

    const where: any = { id: baseId, familyId };
    if (!isAdmin) {
      where.createdBy = userId;
    }

    const result = await this.prisma.event.updateMany({
      where,
      data: {
        ...updateData,
        lunarDate,
      },
    });

    if (result.count > 0 && dto.scope === 'FAMILY') {
      const updatedEvent = await this.prisma.event.findUnique({
        where: { id: baseId },
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
    const baseId = id.split('_')[0];
    // Check if user has permission (is creator or is admin)
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const isAdmin = 
      user.globalRole === 'ADMIN' || 
      user.globalRole === 'SUPER_ADMIN' || 
      user.role?.toLowerCase() === 'admin' ||
      user.role?.toLowerCase() === 'super_admin';
    
    // If not admin, the record must have been created by the user
    const where: any = { id: baseId, familyId };
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

    const events = await this.prisma.event.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    let mappedEvents = events.map((e) => ({
      ...e,
      familyName: familiesMap[e.familyId] || (e.scope === 'GLOBAL' ? 'Hệ thống' : 'Cá nhân'),
    }));

    if (month && year) {
      mappedEvents = this.expandRecurringEvents(mappedEvents, month, year);
    }

    return mappedEvents;
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
