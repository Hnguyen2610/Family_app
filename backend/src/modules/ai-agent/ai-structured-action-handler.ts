import { Injectable, Logger } from '@nestjs/common';
import { normalizeSearchText } from './ai-intent-router';
import { parseCalendarMutation } from './ai-calendar-mutation-parser';
import { AiEntityResolver, ResolvedEntity } from './ai-entity-resolver';
import { AiSkill, AiSkillContext } from './interfaces/ai-skill.interface';
import { AiActionProposalService } from './services/ai-action-proposal.service';
import { AiSkillRegistry } from './skills/ai-skill-registry';
import { AI_I18N } from './ai-i18n';

@Injectable()
export class AiStructuredActionHandler {
  private readonly logger = new Logger(AiStructuredActionHandler.name);

  constructor(
    private readonly skillRegistry: AiSkillRegistry,
    private readonly actionProposalService: AiActionProposalService,
    private readonly entityResolver: AiEntityResolver,
  ) {}

  async tryHandleStructuredCalendarMutation(skill: AiSkill, context: AiSkillContext) {
    if (context.intent !== 'event_mutation') return undefined;

    const calendarSkill = this.getCalendarSkill(skill);
    if (!calendarSkill?.executeTool) return undefined;

    const parsed = parseCalendarMutation(context.userMessage || '', context.resolvedFamilyId);
    if (!parsed) return undefined;
    if (parsed.needsClarification) return parsed.needsClarification;

    if (parsed.action === 'create') {
      const proposal = await this.actionProposalService.createToolProposal('createEvent', parsed.args, context);
      this.logger.debug(`[DirectCalendarMutation] action=create proposal=${proposal.proposalId}`);
      return proposal;
    }

    const resolution = await this.entityResolver.resolveEvent(
      context.userId,
      context.userMessage || '',
      context.resolvedFamilyId || context.familyId,
    );

    let eventId = parsed.args.id || resolution.resolved?.id;
    let lookupResult: any = { id: eventId };

    if (!eventId) {
      if (resolution.candidates.length > 1) {
        return this.buildCandidateSelectionMessage(resolution.candidates);
      }
      lookupResult = await this.findSingleEventIdForMutation(calendarSkill, context, parsed);
      eventId = lookupResult?.id;
    }

    if (!eventId) {
      if (lookupResult && 'message' in lookupResult) return lookupResult.message;
      return AI_I18N.eventNoCandidateFound;
    }

    const toolName = parsed.action === 'delete' ? 'deleteEvent' : 'updateEvent';
    const proposal = await this.actionProposalService.createToolProposal(toolName, {
      ...parsed.args,
      id: eventId,
      familyId: context.resolvedFamilyId || context.familyId,
    }, context);

    this.logger.debug(`[DirectCalendarMutation] action=${parsed.action} proposal=${proposal.proposalId}`);
    return proposal;
  }

  async tryHandleStructuredMemoryEvent(skill: AiSkill, knowledgeSkill: AiSkill | undefined, context: AiSkillContext) {
    const message = context.userMessage || '';
    const normalized = normalizeSearchText(message);
    const date = this.getFullDateFromMessage(message);
    const wantsMemory = /\b(luu|nho|long memory|bo nho|so tay|rag)\b/.test(normalized);
    const wantsEvent = /\b(tao su kien|them su kien|lich|calendar|anniversary|ky niem)\b/.test(normalized);
    const wantsYearly = /\b(hang nam|moi nam|yearly|anniversary)\b/.test(normalized);

    if (!date || !wantsMemory || !wantsEvent || !wantsYearly || !context.resolvedFamilyId) {
      return undefined;
    }

    const calendarSkill = this.getCalendarSkill(skill);
    if (!calendarSkill?.executeTool || !knowledgeSkill?.executeTool) return undefined;

    const memoryTitle = this.extractExplicitTitleFromMessage(message) || `${date.display} ${AI_I18N.eventFamilyReminderSuffix}`;
    const memoryProposal = await this.actionProposalService.createToolProposal('createWikiEntry', {
      title: memoryTitle,
      content: memoryTitle,
      familyId: context.resolvedFamilyId,
    }, context);

    this.logger.debug(`[DirectStructuredAction] memory proposal=${memoryProposal.proposalId}`);
    return memoryProposal;
  }

  private getCalendarSkill(skill: AiSkill) {
    return skill?.name === 'CalendarSkill'
      ? skill
      : this.skillRegistry.getAllSkills().find((candidate) => candidate.name === 'CalendarSkill');
  }

  private buildCandidateSelectionMessage(candidates: ResolvedEntity[]) {
    const rows = candidates.map((candidate, index) => `${index + 1}. "${candidate.title}"`).join('\n');
    return AI_I18N.eventCandidateList(candidates.length, rows);
  }

  private async findSingleEventIdForMutation(calendarSkill: AiSkill, context: AiSkillContext, parsed: any) {
    const lookup = this.withHistoryDate(parsed.lookup, context);
    if (!lookup?.title || !lookup.month || !lookup.year || !calendarSkill.executeTool) return undefined;

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
      if (eventDate !== lookup.date) return false;
      if (!lookup.time) return true;
      return String(event?.time || '') === lookup.time;
    });

    if (matches.length === 1) return { id: matches[0].id };
    if (matches.length > 1) {
      return {
        message: AI_I18N.eventAmbiguousMatches(matches.length),
      };
    }

    return undefined;
  }

  private withHistoryDate(lookup: any, context: AiSkillContext) {
    if (!lookup || lookup.date) return lookup;

    const historyDate = this.findLatestCalendarDateInHistory(context.history || []);
    if (!historyDate) return lookup;

    return {
      ...lookup,
      date: historyDate.iso,
      month: historyDate.month,
      year: historyDate.year,
    };
  }

  private findLatestCalendarDateInHistory(history: any[]) {
    for (const message of [...(history || [])].reverse()) {
      const content = normalizeSearchText(String(message?.content || ''));
      const match = content.match(/(?:su kien ngay|ngay)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
      if (!match) continue;

      return {
        iso: `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`,
        month: Number.parseInt(match[2], 10),
        year: Number.parseInt(match[3], 10),
      };
    }

    return undefined;
  }

  private extractExplicitTitleFromMessage(userMessage: string) {
    const marker = userMessage.match(/(?:voi\s+title|với\s+title|title|tieu\s*de|tiêu\s*đề)\s*(?:la|là|[:：])?\s*/i);
    if (!marker || marker.index === undefined) return '';

    const start = marker.index + marker[0].length;
    const rest = userMessage.slice(start);
    const stop = rest.search(/(?:\.\s*)?(?:sau\s*do|sau\s*đó|roi|rồi|va\s+sau\s*do|và\s+sau\s*đó|sau\s*do\s+giup|sau\s*đó\s+giúp)/i);

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
