import { Injectable, Inject, forwardRef, Logger } from '@nestjs/common';
import { AiSkill, AiSkillContext, AiSkillResponse, AiSkillTool } from '../interfaces/ai-skill.interface';
import { AiIntent } from '../ai-intent-router';
import { EventsService } from '../../events/events.service';
import { formatCalendarEventsForUser, toolSuccess, toolError } from '../ai-tool-runtime';
import { getSolarDateFromLunar as convertLunarToSolar } from '../../../utils/lunar-calendar.util';
import { normalizeSearchText } from '../ai-intent-router';
import { parseCalendarDate } from '../ai-date-parser';
import { AiConversationStateService } from '../services/ai-conversation-state.service';
import { getCalendarReadFamilyId, getMutationFamilyId, shouldIncludePrivateEvents } from '../ai-family-scope-policy';

@Injectable()
export class CalendarSkill implements AiSkill {
  name = 'CalendarSkill';
  private readonly logger = new Logger(CalendarSkill.name);

  constructor(
    @Inject(forwardRef(() => EventsService))
    private readonly eventsService: EventsService,
    private readonly conversationState: AiConversationStateService,
  ) {}

  canHandle(intent: AiIntent): boolean {
    return intent === 'calendar_query' || intent === 'event_mutation';
  }

  getSystemPrompt(_context: AiSkillContext): string {
    const year = new Date().getFullYear().toString();
    return `CALENDAR TOOL RULES:
- If the system prompt packages "[PRE-FETCHED CALENDAR EVENTS FOR ...]" for the targeted date/month, do NOT call getEventsByMonth database tool to retrieve events for those dates. Use the provided list of events directly to reply and construct your plans/menus.
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
              endDate: { type: 'string', description: 'Optional end date in YYYY-MM-DD for multi-day events.' },
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
              endDate: { type: 'string', description: 'Optional end date in YYYY-MM-DD for multi-day events.' },
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
      const normalized = normalizeSearchText(context.userMessage || '');
      if (this.looksLikeCalendarMutation(normalized)) {
        return undefined;
      }

      // Check if LLM reasoning is required for planning/suggestions/recipes
      const requiresLlmReasoning =
        /(\bke\s*hoach\b|\bgoi\s*y\b|\bthuc\s*don\b|\bmenu\b|\ban\s*gi\b|\bnau\s*gi\b|\bmon\s*an\b|\blien\s*hoan\b|\bto\s*chuc\b|\bsap\s*xep\b|\bplan\b|\bsuggest\b|\bparty\b|\borganize\b|\bcook\b|\beat\b)/i.test(normalized);

      const targetDate = parseCalendarDate(context.userMessage);
      if (targetDate) {
        const events = await this.eventsService.getEventsByMonth(
          getCalendarReadFamilyId(context),
          targetDate.month,
          targetDate.year,
          context.userId
        );
        const filtered = this.filterCalendarEvents(events, context.userMessage, targetDate.iso);
        const formattedEvents = this.formatEventsForDay(filtered, targetDate.display);

        const listedEvents = [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 12)
          .map((event, index) => ({
            eventId: event.id,
            date: new Date(event.date).toISOString().split('T')[0],
            time: event.time || undefined,
            title: event.title,
            scope: event.scope,
            familyId: event.familyId,
            rowNumber: index + 1,
          }));
        await this.conversationState.saveState(context.userId, {
          lastShownEvents: listedEvents,
          lastSelectedFamilyId: context.resolvedFamilyId || context.familyId,
          lastIntent: context.intent,
        });

        // Pre-inject event content into context so LLM gets it directly in Loop 1
        const preFetched = `\n\n[PRE-FETCHED CALENDAR EVENTS FOR ${targetDate.display} (${targetDate.iso})]:\n${formattedEvents}`;
        context.familyContext = (context.familyContext || '') + preFetched;

        if (requiresLlmReasoning) {
          return undefined; // Let LLM handle reasoning with pre-injected context
        }

        return {
          content: formattedEvents,
          direct: true,
        };
      }

      const targetMonth = this.getCalendarMonthFromMessage(context.userMessage);
      const wantsPersonalEvents = this.isPersonalEventQuery(normalized);
      if (targetMonth || wantsPersonalEvents) {
        const month = targetMonth?.month || this.getCurrentIctMonth().month;
        const year = targetMonth?.year || this.getCurrentIctMonth().year;
        const events = await this.eventsService.getEventsByMonth(
          getCalendarReadFamilyId(context),
          month,
          year,
          context.userId
        );
        const filtered = this.filterCalendarEvents(events, context.userMessage);
        const formattedEvents = formatCalendarEventsForUser(filtered, month, year);

        const listedEvents = [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
          .slice(0, 12)
          .map((event, index) => ({
            eventId: event.id,
            date: new Date(event.date).toISOString().split('T')[0],
            time: event.time || undefined,
            title: event.title,
            scope: event.scope,
            familyId: event.familyId,
            rowNumber: index + 1,
          }));
        await this.conversationState.saveState(context.userId, {
          lastShownEvents: listedEvents,
          lastSelectedFamilyId: context.resolvedFamilyId || context.familyId,
          lastIntent: context.intent,
        });

        // Pre-inject event content into context so LLM gets it directly in Loop 1
        const preFetched = `\n\n[PRE-FETCHED CALENDAR EVENTS FOR MONTH ${month}/${year}]:\n${formattedEvents}`;
        context.familyContext = (context.familyContext || '') + preFetched;

        if (requiresLlmReasoning) {
          return undefined; // Let LLM handle reasoning with pre-injected context
        }

        return {
          content: formattedEvents,
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
          const searchFamilyId = args.familyId === 'all' ? 'all' : (args.familyId || getCalendarReadFamilyId(context));
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

          this.applyDateRangeFromMessage(args, context.userMessage || '');

          const normalizedMessage = normalizeSearchText(context.userMessage || '');
          const yearlySignal = /\b(hang nam|moi nam|yearly|anniversary)\b/i.test(normalizedMessage);
          if (yearlySignal && !args.recurring) {
            args.recurring = 'YEARLY';
            args.isRecurring = true;
          }

          if (args.endDate && args.title) {
            args.title = this.sanitizeRangeTitle(args.title, args.date, args.endDate);
          }

          this.logger.debug(`createEvent: familyId=${createFamilyId}, date=${args.date}, endDate=${args.endDate || '-'}, title=${args.title}, recurring=${args.recurring}`);

          let eventDate = new Date(args.date);
          const eventEndDate = args.endDate ? new Date(args.endDate) : undefined;
          if (args.time) {
            const [hours, minutes] = args.time.split(':').map(Number);
            if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
              eventDate.setHours(hours, minutes, 0, 0);
            }
          }
          const { dateList: _dateList, ...eventArgs } = args;
          const event = await this.eventsService.create(createFamilyId, context.userId, {
            ...eventArgs,
            familyId: createFamilyId,
            date: eventDate,
            endDate: eventEndDate,
            time: args.time || '09:00',
            recurring: args.useLunar && (args.recurring === 'MONTHLY' || args.recurring === 'YEARLY')
              ? `LUNAR_${args.recurring}`
              : args.recurring,
          });
          this.logger.debug(`Event created: id=${(event as any)?.id}`);
          return toolSuccess(toolName, event);
        }

        case 'updateEvent': {
          const updateFamilyId = getMutationFamilyId(context) || args.familyId || context.familyId;
          let eventDate = args.date ? new Date(args.date) : undefined;
          const eventEndDate = args.endDate ? new Date(args.endDate) : undefined;
          if (eventDate && args.time) {
            const [hours, minutes] = args.time.split(':').map(Number);
            if (!Number.isNaN(hours) && !Number.isNaN(minutes)) {
              eventDate.setHours(hours, minutes, 0, 0);
            }
          }
          const result = await this.eventsService.update(args.id, updateFamilyId, context.userId, {
            ...args,
            familyId: updateFamilyId,
            date: eventDate,
            endDate: eventEndDate,
            recurring: args.useLunar && (args.recurring === 'MONTHLY' || args.recurring === 'YEARLY')
              ? `LUNAR_${args.recurring}`
              : args.recurring,
          });
          return toolSuccess(toolName, result);
        }

        case 'deleteEvent': {
          const deleteFamilyId = getMutationFamilyId(context) || args.familyId || context.familyId;
          return toolSuccess(toolName, await this.eventsService.delete(args.id, deleteFamilyId, context.userId));
        }

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

  private applyDateRangeFromMessage(args: any, message: string) {
    const dateMatches = [...message.matchAll(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g)];
    if (dateMatches.length === 0) return;

    const defaultYear = new Date().getFullYear();
    const toIsoDate = (match: RegExpMatchArray) => {
      const day = match[1].padStart(2, '0');
      const month = match[2].padStart(2, '0');
      const year = match[3] || String(defaultYear);
      return `${year}-${month}-${day}`;
    };

    if (dateMatches[0]) args.date = toIsoDate(dateMatches[0]);
    if (dateMatches[1]) args.endDate = toIsoDate(dateMatches[1]);
  }

  private sanitizeRangeTitle(title: string, startDate?: string, endDate?: string) {
    const compactStart = this.isoToDayMonth(startDate);
    const compactEnd = this.isoToDayMonth(endDate);

    return String(title)
      .replace(new RegExp(`\\s*(tu|từ)\\s+(ngay\\s+)?${compactStart}\\s*(den|đến|-)\\s+(ngay\\s+)?${compactEnd}`, 'i'), '')
      .replace(new RegExp(`\\s*(den|đến)\\s+(ngay\\s+)?${compactEnd}`, 'i'), '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  private isoToDayMonth(value?: string) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    return `${Number(match[3])}\\/${Number(match[2])}(?:\\/${match[1]})?`;
  }

  private getCalendarMonthFromMessage(message: string): { month: number; year: number } | undefined {
    const { month: currentMonth, year: currentYear } = this.getCurrentIctMonth();
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

  private getCurrentIctMonth() {
    const now = new Date();
    const ictDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    return {
      month: ictDate.getUTCMonth() + 1,
      year: ictDate.getUTCFullYear(),
    };
  }

  private filterCalendarEvents(events: any[], message: string, isoDate?: string) {
    const normalized = normalizeSearchText(message || '');
    const privateOnly = this.isPrivateOnlyEventQuery(normalized);

    return (events || []).filter((event) => {
      if (privateOnly && event.scope !== 'PRIVATE') return false;
      if (!isoDate) return true;
      return this.eventOccursOnDate(event, isoDate);
    });
  }

  private isPersonalEventQuery(normalizedMessage: string) {
    return shouldIncludePrivateEvents(normalizedMessage);
  }

  private isPrivateOnlyEventQuery(normalizedMessage: string) {
    return /\b(ca nhan|private|rieng toi)\b/.test(normalizedMessage);
  }

  private looksLikeCalendarMutation(normalizedMessage: string) {
    const hasMutation = /\b(tao|them|len lich|dat lich|sua|cap nhat|doi|doi ten|xoa|huy|delete|update|remove)\b/.test(normalizedMessage);
    const hasCalendarObject = /\b(lich|su kien|event|birthday|sinh nhat|hen|anniversary|ky niem)\b/.test(normalizedMessage);
    return hasMutation && hasCalendarObject;
  }

  private eventOccursOnDate(event: any, isoDate: string) {
    const startIso = this.toDateIso(event?.date);
    const endIso = this.toDateIso(event?.endDate || event?.date);
    return Boolean(startIso && endIso && startIso <= isoDate && isoDate <= endIso);
  }

  private toDateIso(value: any) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toISOString().slice(0, 10);
  }

  private formatEventsForDay(events: any[], displayDate: string) {
    if (!Array.isArray(events) || events.length === 0) {
      return `Không có sự kiện nào vào ngày ${displayDate}.`;
    }

    const lines = [...events]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 12)
      .map((event, index) => {
        const timeText = event?.time ? `${event.time}: ` : '';
        const familyText = event?.familyName ? ` - ${event.familyName}` : '';
        return `${index + 1}. ${timeText}${event?.title || 'Sự kiện'}${familyText}`;
      });

    return `Sự kiện ngày ${displayDate}:\n${lines.join('\n')}`;
  }
}
