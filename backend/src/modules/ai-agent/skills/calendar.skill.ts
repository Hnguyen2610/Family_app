import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { AiIntent } from '../ai-intent-router';
import { EventsService } from '../../events/events.service';
import { formatCalendarEventsForUser, toolSuccess, toolError } from '../ai-tool-results';
import { getSolarDateFromLunar as convertLunarToSolar } from '../../../utils/lunar-calendar.util';
import { normalizeSearchText } from '../ai-intent-router';

@Injectable()
export class CalendarSkill implements AiSkill {
  name = 'CalendarSkill';
  private readonly logger = new Logger(CalendarSkill.name);

  constructor(
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
  ) {}

  canHandle(intent: AiIntent): boolean {
    return intent === 'calendar_query' || intent === 'event_mutation';
  }

  getSystemPrompt(_context: AiSkillContext): string {
    const year = new Date().getFullYear().toString();
    return `CALENDAR TOOL RULES:
- Use createEvent only when the user explicitly asks to create/add/schedule an event.
- When creating an event, always set scope. Default to FAMILY unless the user explicitly says it is private/personal.
- For Telegram group requests or text saying "ca gia dinh", "family", "group", or "cho ca nha", create the event with scope FAMILY.
- Use getEventsByMonth when the user asks to check calendar/events for a month.
- Use updateEvent to change an existing event.
- Use deleteEvent to remove an event.
- Use getSolarDateFromLunar before creating lunar recurring events.
- Never nest tool calls. If lunar conversion is needed, call getSolarDateFromLunar first, then createEvent in the next step.
- If the user mentions birthday, use type BIRTHDAY.
- "Ram" = lunar day 15, recurring MONTHLY, useLunar true.
- "Mung 1" = lunar day 1, recurring MONTHLY, useLunar true.
- "Gio" = yearly lunar anniversary, recurring YEARLY, useLunar true.
- If the user gives a date like "21/3", convert it to ${year}-MM-DD.`;
  }

  getTools(): AiSkillTool[] {
    return [
      {
        type: 'function',
        function: {
          name: 'getEventsByMonth',
          description: 'Get all events for a specific month. Calls this to check the calendar.',
          parameters: {
            type: 'object',
            properties: {
              familyId: { type: 'string', description: 'Family ID. Use "all" to search for events across all families.' },
              month: { type: 'number', description: 'Month (1-12)' },
              year: { type: 'number', description: 'Year' },
              userId: { type: 'string', description: 'Optional User ID for private events' },
            },
            required: ['familyId', 'month', 'year'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'createEvent',
          description: 'Create a new event in the family calendar. Use ONLY when the user explicitly asks.',
          parameters: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              date: { type: 'string', description: 'YYYY-MM-DD' },
              time: { type: 'string', description: 'HH:mm' },
              scope: { type: 'string', enum: ['PRIVATE', 'FAMILY'] },
              isRecurring: { type: 'boolean' },
              recurring: { type: 'string', enum: ['NONE', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
              familyId: { type: 'string' },
              useLunar: { type: 'boolean' },
            },
            required: ['title', 'date'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'updateEvent',
          description: 'Update an existing event.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              familyId: { type: 'string' },
              title: { type: 'string' },
              description: { type: 'string' },
              date: { type: 'string' },
              time: { type: 'string' },
              type: { type: 'string', enum: ['BIRTHDAY', 'ANNIVERSARY', 'HOLIDAY', 'APPOINTMENT', 'TASK', 'GENERAL'] },
              isRecurring: { type: 'boolean' },
              recurring: { type: 'string', enum: ['NONE', 'WEEKLY', 'MONTHLY', 'YEARLY'] },
              useLunar: { type: 'boolean' },
            },
            required: ['id', 'familyId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'deleteEvent',
          description: 'Delete an event from the calendar.',
          parameters: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              familyId: { type: 'string' },
            },
            required: ['id', 'familyId'],
          },
        },
      },
      {
        type: 'function',
        function: {
          name: 'getSolarDateFromLunar',
          description: 'Convert a lunar date to solar date.',
          parameters: {
            type: 'object',
            properties: {
              day: { type: 'number' },
              month: { type: 'number' },
              year: { type: 'number' },
            },
            required: ['day', 'month', 'year'],
          },
        },
      },
    ];
  }

  async tryDirectAnswer(context: AiSkillContext): Promise<AiSkillResponse | undefined> {
    if (context.intent === 'calendar_query') {
      const targetMonth = this.getCalendarMonthFromMessage(context.userMessage);
      if (targetMonth) {
        const events = await this.eventsService.getEventsByMonth(
          context.familyId,
          targetMonth.month,
          targetMonth.year,
          context.userId
        );
        return {
          content: formatCalendarEventsForUser(events, targetMonth.month, targetMonth.year),
          direct: true,
        };
      }
    }
    return undefined;
  }

  async executeTool(toolName: string, args: any, context: AiSkillContext): Promise<any> {
    try {
      switch (toolName) {
        case 'getEventsByMonth': {
          const searchFamilyId = args.familyId === 'all' ? 'all' : (args.familyId || context.familyId);
          const events = await this.eventsService.getEventsByMonth(
            searchFamilyId,
            args.month,
            args.year,
            args.userId || context.userId
          );
          return toolSuccess(toolName, events);
        }

        case 'createEvent': {
          // ALWAYS use resolvedFamilyId from context — never trust AI-provided familyId
          const createFamilyId = context.resolvedFamilyId;

          if (!createFamilyId) {
            // User is in 'all families' mode with multiple families — ask for clarification
            return { needsClarification: true, message: 'TOOL_NEEDS_CLARIFICATION: Please ask the user which specific family they want to create this event in before calling this tool again.' };
          }

          const fullDateMatch = (context.userMessage || '').match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
          if (fullDateMatch) {
            args.date = `${fullDateMatch[3]}-${fullDateMatch[2].padStart(2, '0')}-${fullDateMatch[1].padStart(2, '0')}`;
          }

          const normalizedMessage = normalizeSearchText(context.userMessage || '');
          const yearlySignal = /\b(hang nam|moi nam|yearly|anniversary)\b/i.test(normalizedMessage);
          if (yearlySignal && !args.recurring) {
            args.recurring = 'YEARLY';
            args.isRecurring = true;
          }

          this.logger.debug(`createEvent: familyId=${createFamilyId}, date=${args.date}, title=${args.title}, recurring=${args.recurring}`);

          let eventDate = new Date(args.date);
          if (args.time) {
            const [hours, minutes] = args.time.split(':').map(Number);
            if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
              eventDate.setHours(hours, minutes, 0, 0);
            }
          }
          const { dateList: _dateList, endDate: _endDate, ...eventArgs } = args;
          const event = await this.eventsService.create(createFamilyId, context.userId, {
            ...eventArgs,
            familyId: createFamilyId,
            date: eventDate,
            time: args.time || '09:00',
            recurring: args.useLunar && (args.recurring === 'MONTHLY' || args.recurring === 'YEARLY')
              ? `LUNAR_${args.recurring}`
              : args.recurring,
          });
          this.logger.debug(`Event created: id=${(event as any)?.id}`);
          return toolSuccess(toolName, event);
        }

        case 'updateEvent': {
          let eventDate = args.date ? new Date(args.date) : undefined;
          if (eventDate && args.time) {
            const [hours, minutes] = args.time.split(':').map(Number);
            if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
              eventDate.setHours(hours, minutes, 0, 0);
            }
          }
          const result = await this.eventsService.update(args.id, args.familyId || context.familyId, context.userId, {
            ...args,
            date: eventDate,
            recurring: args.useLunar && (args.recurring === 'MONTHLY' || args.recurring === 'YEARLY')
              ? `LUNAR_${args.recurring}`
              : args.recurring,
          });
          return toolSuccess(toolName, result);
        }

        case 'deleteEvent':
          return toolSuccess(toolName, await this.eventsService.delete(args.id, args.familyId || context.familyId, context.userId));

        case 'getSolarDateFromLunar': {
          const date = convertLunarToSolar(args.day, args.month, args.year);
          if (!date) return toolError(toolName, 'Khong tim thay ngay duong lich');
          return toolSuccess(toolName, {
            solarDate: date.toISOString().split('T')[0],
            formatted: date.toLocaleDateString('vi-VN'),
          });
        }
      }
    } catch (e: any) {
      return toolError(toolName, e.message);
    }
    return undefined;
  }

  private getCalendarMonthFromMessage(message: string): { month: number; year: number } | undefined {
    const now = new Date();
    const ictDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const currentMonth = ictDate.getUTCMonth() + 1;
    const currentYear = ictDate.getUTCFullYear();
    const normalized = normalizeSearchText(message || '');

    if (normalized.includes('thang nay')) return { month: currentMonth, year: currentYear };
    if (normalized.includes('thang sau')) {
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear;
      return { month: nextMonth, year: nextYear };
    }

    const explicitMonth = normalized.match(/thang\s+(\d{1,2})(?:\D+(\d{4}))?/);
    if (explicitMonth) {
      const month = Number.parseInt(explicitMonth[1], 10);
      const year = explicitMonth[2] ? Number.parseInt(explicitMonth[2], 10) : currentYear;
      if (month >= 1 && month <= 12) return { month, year };
    }

    return undefined;
  }
}
