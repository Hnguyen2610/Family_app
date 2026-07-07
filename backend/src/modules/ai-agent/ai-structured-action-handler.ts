import { Injectable, Logger } from '@nestjs/common';
import { AiSkillContext } from './interfaces/ai-skill.interface';
import { normalizeSearchText } from './ai-intent-router';
import { parseCalendarMutation } from './ai-calendar-mutation-parser';
import { AiSkillRegistry } from './skills/ai-skill-registry';
import { AiActionProposalService } from './services/ai-action-proposal.service';

@Injectable()
export class AiStructuredActionHandler {
  private readonly logger = new Logger(AiStructuredActionHandler.name);

  constructor(
    private readonly skillRegistry: AiSkillRegistry,
    private readonly actionProposalService: AiActionProposalService,
  ) {}

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
      const proposal = await this.actionProposalService.createToolProposal('createEvent', parsed.args, context);
      this.logger.debug(`[DirectCalendarMutation] action=create proposal=${proposal.proposalId}`);
      return proposal;
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
    const proposal = await this.actionProposalService.createToolProposal(toolName, args, context);
    this.logger.debug(`[DirectCalendarMutation] action=${parsed.action} proposal=${proposal.proposalId}`);
    return proposal;
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
    const memoryProposal = await this.actionProposalService.createToolProposal('createWikiEntry', {
      title: memoryTitle,
      content: memoryTitle,
      familyId: context.resolvedFamilyId,
    }, context);
    this.logger.debug(`[DirectStructuredAction] memory proposal=${memoryProposal.proposalId}`);
    return memoryProposal;

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

}
