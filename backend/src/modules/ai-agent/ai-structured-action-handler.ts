import { Injectable, Logger } from '@nestjs/common';
import { AiSkillContext } from './interfaces/ai-skill.interface';
import { normalizeSearchText } from './ai-intent-router';
import { parseCalendarDate, parseCalendarMutation } from './ai-calendar-mutation-parser';
import { AiSkillRegistry } from './skills/ai-skill-registry';

@Injectable()
export class AiStructuredActionHandler {
  private readonly logger = new Logger(AiStructuredActionHandler.name);

  constructor(private readonly skillRegistry: AiSkillRegistry) {}

  async tryHandleStructuredCalendarMutation(skill: any, context: AiSkillContext) {
    if (context.intent !== 'event_mutation') return undefined;

    const calendarSkill = skill?.name === 'CalendarSkill'
      ? skill
      : this.skillRegistry.getAllSkills().find((candidate) => candidate.name === 'CalendarSkill');
    if (!calendarSkill?.executeTool) return undefined;

    const parsed = parseCalendarMutation(context.userMessage || '', context.resolvedFamilyId);
    if (!parsed) return undefined;
    if (parsed.needsClarification) return parsed.needsClarification;

    if (parsed.action === 'create') {
      const dateList = Array.isArray(parsed.args.dateList) ? parsed.args.dateList.filter(Boolean) : [];
      if (dateList.length > 1) {
        const results = [];
        for (const date of dateList) {
          const { dateList: _dateList, endDate: _endDate, ...singleEventArgs } = parsed.args;
          const result = await calendarSkill.executeTool('createEvent', {
            ...singleEventArgs,
            date,
          }, context);
          results.push(result);
        }
        this.logger.debug(`[DirectCalendarMutation] action=create_range count=${results.length}`);
        return this.formatStructuredCalendarMutationResult(parsed.action, parsed.args, results);
      }

      const result = await calendarSkill.executeTool('createEvent', parsed.args, context);
      this.logger.debug(`[DirectCalendarMutation] action=create result=${JSON.stringify(result)}`);
      return this.formatStructuredCalendarMutationResult(parsed.action, parsed.args, result);
    }

    const eventId = parsed.args.id || await this.findSingleEventIdForMutation(calendarSkill, context, parsed);
    if (!eventId) {
      return 'Mình chưa tìm được sự kiện khớp với yêu cầu. Hãy gửi tên sự kiện kèm ngày, hoặc mở lịch và gửi lại ID sự kiện.';
    }

    const toolName = parsed.action === 'delete' ? 'deleteEvent' : 'updateEvent';
    const args = {
      ...parsed.args,
      id: eventId,
      familyId: context.resolvedFamilyId || context.familyId,
    };
    const result = await calendarSkill.executeTool(toolName, args, context);
    this.logger.debug(`[DirectCalendarMutation] action=${parsed.action} result=${JSON.stringify(result)}`);
    return this.formatStructuredCalendarMutationResult(parsed.action, args, result);
  }

  async tryHandleStructuredMemoryEvent(skill: any, knowledgeSkill: any, context: AiSkillContext) {
    const message = context.userMessage || '';
    const normalized = normalizeSearchText(message);
    const date = this.getFullDateFromMessage(message);
    const wantsMemory = /\b(luu|nho|long memory|bo nho|so tay|rag)\b/.test(normalized);
    const wantsEvent = /\b(tao su kien|them su kien|lich|calendar|anniversary|ky niem)\b/.test(normalized);
    const wantsYearly = /\b(hang nam|moi nam|yearly|anniversary)\b/.test(normalized);

    if (!date || !wantsMemory || !wantsEvent || !wantsYearly || !context.resolvedFamilyId) {
      return undefined;
    }

    const calendarSkill = skill?.name === 'CalendarSkill'
      ? skill
      : this.skillRegistry.getAllSkills().find((candidate) => candidate.name === 'CalendarSkill');
    if (!calendarSkill?.executeTool || !knowledgeSkill?.executeTool) return undefined;

    const memoryTitle = this.extractExplicitTitleFromMessage(message) || `${date.display} là kỷ niệm gia đình`;
    const eventTitle = this.buildEventTitleFromMemoryTitle(memoryTitle);

    const memoryResult = await knowledgeSkill.executeTool('createWikiEntry', {
      title: memoryTitle,
      content: memoryTitle,
      familyId: context.resolvedFamilyId,
    }, context);

    if (memoryResult?.data?.consentRequired) {
      return 'Thông tin này có vẻ nhạy cảm nên mình chưa lưu vào lòng memory. Hãy xác nhận trước khi lưu vào sổ tay gia đình.';
    }

    const eventResult = await calendarSkill.executeTool('createEvent', {
      title: eventTitle,
      description: memoryTitle,
      date: date.iso,
      scope: 'FAMILY',
      type: 'ANNIVERSARY',
      isRecurring: true,
      recurring: 'YEARLY',
      familyId: context.resolvedFamilyId,
    }, context);

    this.logger.debug(`[DirectStructuredAction] memory=${JSON.stringify(memoryResult)} event=${JSON.stringify(eventResult)}`);
    return `Đã lưu vào sổ tay gia đình: ${memoryTitle}\nĐã tạo sự kiện kỷ niệm hàng năm: ${eventTitle} (${date.display}).`;
  }

  private async findSingleEventIdForMutation(calendarSkill: any, context: AiSkillContext, parsed: any) {
    const lookup = parsed.lookup;
    if (!lookup?.title || !lookup.month || !lookup.year) return undefined;

    const result = await calendarSkill.executeTool('getEventsByMonth', {
      familyId: context.resolvedFamilyId || context.familyId,
      month: lookup.month,
      year: lookup.year,
      userId: context.userId,
    }, context);

    const events = Array.isArray(result?.data) ? result.data : [];
    const normalizedTitle = normalizeSearchText(lookup.title);
    const matches = events.filter((event: any) => {
      const eventTitle = normalizeSearchText(event?.title || '');
      const titleMatches = eventTitle.includes(normalizedTitle) || normalizedTitle.includes(eventTitle);
      if (!titleMatches) return false;
      if (!lookup.date) return true;
      const eventDate = event?.date ? new Date(event.date).toISOString().slice(0, 10) : '';
      return eventDate === lookup.date;
    });

    return matches.length === 1 ? matches[0].id : undefined;
  }

  private formatStructuredCalendarMutationResult(action: string, args: any, result: any) {
    if (Array.isArray(result)) {
      const failed = result.filter((item) => item?.ok === false);
      if (failed.length > 0) {
        return failed[0]?.error?.message || 'Không thể tạo đầy đủ chuỗi sự kiện lúc này.';
      }
    }

    if (result?.ok === false) {
      return result?.error?.message || 'Không thể thực hiện thao tác lịch lúc này.';
    }

    if (action === 'delete') {
      return 'Đã xóa sự kiện khỏi lịch.';
    }

    const date = args.date ? parseCalendarDate(String(args.date)) : undefined;
    const endDate = args.endDate ? parseCalendarDate(String(args.endDate)) : undefined;
    const dateText = endDate
      ? `${date?.display || args.date} - ${endDate.display || args.endDate}`
      : date?.display || args.date || 'chưa rõ ngày';
    const scopeText = args.scope === 'PRIVATE' ? 'Cá nhân' : 'Gia đình';
    if (action === 'update') {
      return `Đã cập nhật sự kiện${args.title ? `: ${args.title}` : ''}.\nNgày: ${dateText}${args.time ? `\nGiờ: ${args.time}` : ''}`;
    }

    return [
      `Đã tạo sự kiện: ${args.title || 'Su kien'}`,
      `Ngày: ${dateText}`,
      `Giờ: ${args.time || '09:00'}`,
      `Phạm vi: ${scopeText}`,
      args.recurring && args.recurring !== 'NONE' ? `Được lặp lại: ${args.recurring}` : undefined,
    ].filter(Boolean).join('\n');
  }

  private extractExplicitTitleFromMessage(userMessage: string) {
    const marker = userMessage.match(/(?:v[oá»›]i\s+title|title|ti[eÃª]u\s*[dÄ‘][eá»])\s*[:ï¼š]?\s*/i);
    if (!marker || marker.index === undefined) return '';

    const start = marker.index + marker[0].length;
    const rest = userMessage.slice(start);
    const stop = rest.search(/(?:\.\s*)?(?:sau\s*[dÄ‘][oÃ³]|r[oá»“]i|v[aÃ ]\s+sau\s*[dÄ‘][oÃ³]|sau\s+[dÄ‘][oÃ³]\s+gi[uÃº]p)/i);

    return (stop >= 0 ? rest.slice(0, stop) : rest)
      .replace(/^[\s"']+|[\s"'.]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private getFullDateFromMessage(userMessage: string) {
    const match = userMessage.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!match) return undefined;

    return {
      display: `${match[1].padStart(2, '0')}/${match[2].padStart(2, '0')}/${match[3]}`,
      iso: `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`,
    };
  }

  private buildEventTitleFromMemoryTitle(memoryTitle: string) {
    return memoryTitle
      .replace(/^\d{1,2}\/\d{1,2}\/\d{4}\s*(?:l[aÃ ]\s*)?/i, '')
      .trim() || memoryTitle || 'Kỷ niệm gia đình';
  }
}
