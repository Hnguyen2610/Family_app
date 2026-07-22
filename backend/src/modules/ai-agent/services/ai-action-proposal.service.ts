import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { EventsService } from '../../events/events.service';
import { parseCalendarDate, parseCalendarDateRange } from '../ai-date-parser';
import { AiSkillContext } from '../interfaces/ai-skill.interface';
import { RagService } from './rag.service';
import { AI_I18N } from '../ai-i18n';

export type AiActionProposalSource = 'web' | 'telegram';
export type AiActionProposalAction =
  | 'create_event'
  | 'update_event'
  | 'delete_event'
  | 'create_task'
  | 'save_note';

export type AiActionProposalRisk = 'low' | 'medium' | 'high';
export type AiActionProposalTargetType = 'event' | 'note' | 'task';

export interface CreateAiActionProposalInput {
  userId: string;
  familyId?: string;
  source: AiActionProposalSource;
  action: AiActionProposalAction;
  payload: Record<string, unknown>;
  targetType?: AiActionProposalTargetType;
  targetId?: string;
  riskLevel?: AiActionProposalRisk;
  before?: Record<string, any>;
  after?: Record<string, any>;
  requiresConfirmation?: boolean;
  expiresAt?: Date;
}

const TOOL_ACTION_MAP: Record<string, AiActionProposalAction> = {
  createEvent: 'create_event',
  updateEvent: 'update_event',
  deleteEvent: 'delete_event',
  createWikiEntry: 'save_note',
};

const ACTION_TARGET_TYPE_MAP: Record<AiActionProposalAction, AiActionProposalTargetType> = {
  create_event: 'event',
  update_event: 'event',
  delete_event: 'event',
  create_task: 'task',
  save_note: 'note',
};

const ACTION_RISK_MAP: Record<AiActionProposalAction, AiActionProposalRisk> = {
  create_event: 'low',
  update_event: 'medium',
  delete_event: 'high',
  create_task: 'low',
  save_note: 'low',
};

@Injectable()
export class AiActionProposalService {
  private readonly defaultExpiryMinutes = 15;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly eventsService?: EventsService,
    @Optional() private readonly ragService?: RagService,
  ) {}

  async createProposal(input: CreateAiActionProposalInput) {
    if (!input.userId) {
      throw new BadRequestException('userId is required');
    }

    return this.proposals.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        source: input.source,
        action: input.action,
        payload: input.payload,
        status: 'PENDING',
        targetType: input.targetType,
        targetId: input.targetId,
        riskLevel: input.riskLevel ?? ACTION_RISK_MAP[input.action] ?? 'low',
        requiresConfirmation: input.requiresConfirmation ?? true,
        before: input.before,
        after: input.after,
        expiresAt: input.expiresAt ?? this.getDefaultExpiry(),
      },
    });
  }

  async createToolProposal(toolName: string, args: any, context: AiSkillContext) {
    const action = TOOL_ACTION_MAP[toolName];
    if (!action) {
      throw new BadRequestException(`Unsupported proposal tool: ${toolName}`);
    }

    const familyId = context.resolvedFamilyId || context.familyId;
    const normalizedArgs = this.normalizeToolProposalArgs(toolName, args, context);
    const duplicateNote = action === 'save_note'
      ? await this.findDuplicateNoteSnapshot(familyId, normalizedArgs)
      : undefined;
    const proposalArgs = duplicateNote
      ? {
          ...normalizedArgs,
          documentId: duplicateNote.id,
          mergeStrategy: 'merge_duplicate',
          mergedContent: duplicateNote.mergedContent,
        }
      : normalizedArgs;
    const payload = {
      toolName,
      args: proposalArgs,
      familyId,
      userId: context.userId,
    };

    const before = duplicateNote || await this.fetchBeforeSnapshot(action, proposalArgs, familyId);
    const after = duplicateNote
      ? { title: proposalArgs.title, content: proposalArgs.mergedContent }
      : this.buildAfterSnapshot(action, proposalArgs);
    const riskLevel = duplicateNote ? 'medium' : ACTION_RISK_MAP[action];
    const targetType = ACTION_TARGET_TYPE_MAP[action];
    const targetId = duplicateNote?.id || proposalArgs.id || undefined;

    await this.assertNoDuplicatePendingProposal(context.userId, action, targetType, targetId);

    // ── Self-Reflective Planner: detect schedule conflicts before proposing ──
    const conflictNote = action === 'create_event'
      ? await this.detectScheduleConflict(familyId, context.userId, proposalArgs)
      : undefined;

    const proposal = await this.createProposal({
      userId: context.userId,
      familyId,
      source: context.source?.startsWith('telegram') ? 'telegram' : 'web',
      action,
      payload,
      targetType,
      targetId,
      riskLevel: conflictNote ? 'medium' : riskLevel,
      before,
      after,
    });

    const baseSummary = duplicateNote
      ? this.buildDuplicateNoteSummary(proposalArgs, duplicateNote)
      : this.buildProposalSummary(action, proposalArgs, before);

    const summary = conflictNote
      ? `${baseSummary}\n\n${conflictNote}`
      : baseSummary;

    return {
      type: 'action_proposal',
      proposalId: proposal.id,
      action,
      payload,
      targetType,
      targetId,
      riskLevel: conflictNote ? 'medium' : riskLevel,
      before,
      after,
      summary,
      message: conflictNote
        ? AI_I18N.proposalHighRiskMessage
        : this.buildProposalMessage(action, riskLevel),
      conflictDetected: !!conflictNote,
    };
  }

  async confirm(id: string, userId: string) {
    const proposal = await this.findPendingProposal(id, userId);
    const result = await this.executeProposal(proposal);
    const payload = this.mergeProposalResult(proposal.payload, result);

    return this.proposals.update({
      where: { id: proposal.id },
      data: payload
        ? { status: 'CONFIRMED', payload }
        : { status: 'CONFIRMED' },
    });
  }

  async reject(id: string, userId: string) {
    const proposal = await this.findPendingProposal(id, userId);

    return this.proposals.update({
      where: { id: proposal.id },
      data: { status: 'REJECTED' },
    });
  }

  private async fetchBeforeSnapshot(
    action: AiActionProposalAction,
    args: Record<string, any>,
    familyId: string,
  ): Promise<Record<string, any> | undefined> {
    if (action !== 'update_event' && action !== 'delete_event') return undefined;

    const eventId = String(args.id || '');
    if (!eventId || !this.eventsService) return undefined;

    try {
      const event = await this.eventsService.findById(eventId, familyId);
      if (!event) return undefined;
      return {
        id: event.id,
        title: event.title,
        date: event.date ? new Date(event.date).toISOString().split('T')[0] : undefined,
        time: (event as any).time,
        scope: (event as any).scope,
        description: (event as any).description,
        familyId: event.familyId,
      };
    } catch {
      return undefined;
    }
  }

  private buildAfterSnapshot(
    action: AiActionProposalAction,
    args: Record<string, any>,
  ): Record<string, any> | undefined {
    if (action === 'delete_event') return undefined;

    const snapshot: Record<string, any> = {};
    if (args.title) snapshot.title = args.title;
    if (args.date) snapshot.date = args.date;
    if (args.time) snapshot.time = args.time;
    if (args.scope) snapshot.scope = args.scope;
    if (args.description) snapshot.description = args.description;
    if (args.content) snapshot.content = args.content;

    return Object.keys(snapshot).length > 0 ? snapshot : undefined;
  }

  private normalizeToolProposalArgs(toolName: string, args: any, context: AiSkillContext) {
    const normalizedArgs = this.asRecord(args);
    if (toolName !== 'createEvent' && toolName !== 'updateEvent') return normalizedArgs;

    const userMessage = context.userMessage || '';
    const dateRange = parseCalendarDateRange(userMessage);
    if (dateRange) {
      return {
        ...normalizedArgs,
        date: dateRange.start.iso,
        endDate: dateRange.end.iso,
        dateList: dateRange.dates.map((item) => item.iso),
      };
    }

    const parsedDate = parseCalendarDate(userMessage);
    if (!parsedDate) return normalizedArgs;

    return {
      ...normalizedArgs,
      date: parsedDate.iso,
    };
  }

  private buildProposalMessage(action: AiActionProposalAction, risk: AiActionProposalRisk): string {
    if (action === 'delete_event') {
      return AI_I18N.proposalDeleteEventMessage;
    }
    if (risk === 'high') {
      return AI_I18N.proposalHighRiskMessage;
    }
    return AI_I18N.proposalDefaultMessage;
  }

  private buildProposalSummary(
    action: AiActionProposalAction,
    args: Record<string, any>,
    before?: Record<string, any>,
  ) {
    if (action === 'create_event') {
      const title = args.title || AI_I18N.proposalNewEvent;
      const date = args.endDate ? `${args.date} ${AI_I18N.proposalTo} ${args.endDate}` : args.date;
      return AI_I18N.proposalCreateEventSummary(title, date || AI_I18N.proposalSelectedDay, args.time);
    }

    if (action === 'update_event') {
      const parts: string[] = [];
      if (before?.title && args.title && before.title !== args.title) {
        parts.push(AI_I18N.proposalUpdateNameChange(before.title, args.title));
      } else if (args.title) {
        parts.push(AI_I18N.proposalUpdateNameSet(args.title));
      }
      if (before?.date && args.date && before.date !== args.date) {
        parts.push(AI_I18N.proposalUpdateDateChange(before.date, args.date));
      } else if (args.date) {
        parts.push(AI_I18N.proposalUpdateDateSet(args.date));
      }
      if (before?.time && args.time && before.time !== args.time) {
        parts.push(AI_I18N.proposalUpdateTimeChange(before.time, args.time));
      } else if (args.time) {
        parts.push(AI_I18N.proposalUpdateTimeSet(args.time));
      }
      if (args.scope) parts.push(AI_I18N.proposalUpdateScope(args.scope));
      return parts.length > 0
        ? `${AI_I18N.proposalUpdateSummaryHeader}${parts.join('\n')}`
        : AI_I18N.proposalUpdateSummaryDefault;
    }

    if (action === 'delete_event') {
      const title = before?.title || args.title || AI_I18N.proposalDeleteDefaultTitle;
      const date = before?.date || args.date;
      return AI_I18N.proposalDeleteSummary(title, date);
    }

    if (action === 'save_note') {
      return AI_I18N.proposalSaveNoteSummary(args.title || AI_I18N.proposalSaveNoteDefaultTitle);
    }

    return AI_I18N.proposalDefaultSummary;
  }

  private async findPendingProposal(id: string, userId: string) {
    if (!id || !userId) {
      throw new BadRequestException('proposal id and userId are required');
    }

    const proposal = await this.proposals.findFirst({
      where: {
        id,
        userId,
        status: 'PENDING',
      },
    });

    if (!proposal) {
      throw new NotFoundException(AI_I18N.proposalNotFound);
    }

    if (proposal.expiresAt < new Date()) {
      try {
        await this.proposals.update({ where: { id }, data: { status: 'EXPIRED' } });
      } catch {
        // Best effort only. The user-facing error below is the important result.
      }
      throw new BadRequestException(AI_I18N.proposalExpired);
    }

    return proposal;
  }

  private getDefaultExpiry() {
    return new Date(Date.now() + this.defaultExpiryMinutes * 60 * 1000);
  }

  private async executeProposal(proposal: any) {
    const payload = this.asPayload(proposal.payload);
    const args = this.asRecord(payload.args);
    const familyId = String(payload.familyId || proposal.familyId || args.familyId || '');
    const userId = String(payload.userId || proposal.userId || '');

    if (proposal.action === 'create_event') {
      this.assertEventsService();
      return this.eventsService!.create(familyId, userId, this.stripToolOnlyEventArgs(args) as any);
    }

    if (proposal.action === 'update_event') {
      this.assertEventsService();
      const eventId = String(proposal.targetId || args.id || '');
      if (!eventId) throw new BadRequestException('Event id is required');
      await this.assertCanMutateEvent(eventId, familyId, userId);
      return this.eventsService!.update(eventId, familyId, userId, this.stripToolOnlyEventArgs(args) as any);
    }

    if (proposal.action === 'delete_event') {
      this.assertEventsService();
      const eventId = String(proposal.targetId || args.id || '');
      if (!eventId) throw new BadRequestException('Event id is required');
      await this.assertCanMutateEvent(eventId, familyId, userId);
      return this.eventsService!.delete(eventId, familyId, userId);
    }

    if (proposal.action === 'save_note') {
      this.assertRagService();
      const title = String(args.title || '').trim();
      const content = String(args.content || title).trim();
      if (!title || !content) throw new BadRequestException('Note title and content are required');
      const documentId = String(args.documentId || proposal.targetId || '').trim();
      if (documentId && args.mergeStrategy === 'merge_duplicate') {
        return this.ragService!.updateKnowledgeDocument(familyId, documentId, {
          title,
          content: String(args.mergedContent || content),
          metadata: this.asRecord(args.metadata),
        });
      }
      return this.ragService!.createKnowledgeDocument({
        familyId,
        title,
        content,
        createdBy: userId,
        metadata: this.asRecord(args.metadata),
      });
    }

    return undefined;
  }

  private mergeProposalResult(payload: unknown, result: unknown) {
    if (result === undefined) return undefined;
    return {
      ...this.asPayload(payload),
      result,
    };
  }

  private stripToolOnlyEventArgs(args: Record<string, unknown>) {
    const {
      familyId: _familyId,
      userId: _userId,
      creatorId: _creatorId,
      id: _id,
      ...eventArgs
    } = args;
    return eventArgs;
  }

  private asPayload(payload: unknown): Record<string, any> {
    return payload && typeof payload === 'object' && !Array.isArray(payload)
      ? payload as Record<string, any>
      : {};
  }

  private asRecord(value: unknown): Record<string, any> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, any>
      : {};
  }

  private assertEventsService() {
    if (!this.eventsService) throw new BadRequestException('Event proposal execution is not available');
  }

  private assertRagService() {
    if (!this.ragService) throw new BadRequestException('Note proposal execution is not available');
  }

  private async findDuplicateNoteSnapshot(familyId: string, args: Record<string, any>) {
    this.assertRagService();
    const title = String(args.title || '').trim();
    const content = String(args.content || '').trim();
    if (!familyId || !title || !content || !this.ragService?.findDuplicateKnowledgeDocument) {
      return undefined;
    }

    const duplicate = await this.ragService.findDuplicateKnowledgeDocument(familyId, title, content);
    if (!duplicate) return undefined;

    return {
      id: duplicate.id,
      title: duplicate.title,
      content: duplicate.content,
      metadata: duplicate.metadata || {},
      mergedContent: duplicate.mergedContent,
    };
  }

  private buildDuplicateNoteSummary(args: Record<string, any>, duplicate: Record<string, any>) {
    return AI_I18N.proposalDuplicateNoteSummary(duplicate.title);
  }

  private async assertNoDuplicatePendingProposal(
    userId: string,
    action: AiActionProposalAction,
    targetType?: AiActionProposalTargetType,
    targetId?: string,
  ) {
    if (!userId || !targetType || !targetId) return;

    const existing = await this.proposals.findFirst({
      where: {
        userId,
        action,
        status: 'PENDING',
        targetType,
        targetId,
      },
      select: { id: true },
    });

    if (existing) {
      throw new BadRequestException(AI_I18N.proposalDuplicatePending);
    }
  }

  private async assertCanMutateEvent(eventId: string, familyId: string, userId: string) {
    const event = await this.prisma.event?.findFirst?.({
      where: { id: eventId.split('_')[0], familyId },
      select: { id: true, createdBy: true },
    });

    if (!event) {
      throw new NotFoundException(AI_I18N.eventNotFound);
    }

    const user = await this.prisma.user?.findUnique?.({
      where: { id: userId },
      select: { globalRole: true, role: true },
    });
    const role = String(user?.role || '').toLowerCase();
    const globalRole = String(user?.globalRole || '').toUpperCase();
    const isAdmin = globalRole === 'ADMIN' || globalRole === 'SUPER_ADMIN' || role === 'admin' || role === 'super_admin';

    if (!isAdmin && event.createdBy !== userId) {
      throw new ForbiddenException(AI_I18N.eventNoPermission);
    }
  }

  private get proposals() {
    return (this.prisma as any).aiActionProposal;
  }

  // ── Self-Reflective Planner ────────────────────────────────────────────────

  /**
   * Check if the proposed event time conflicts with an existing event on the same day.
   * Returns a human-readable conflict note (with alternative slots) or undefined if clear.
   */
  private async detectScheduleConflict(
    familyId: string,
    userId: string,
    args: Record<string, any>,
  ): Promise<string | undefined> {
    if (!args.date || !args.time || !this.eventsService) return undefined;
    // Recurring or all-day events: skip conflict check
    if (!args.time || args.isRecurring) return undefined;

    const dateStr = String(args.date);
    const [year, month] = dateStr.split('-').map(Number);
    if (!year || !month) return undefined;

    const proposedMinutes = this.timeToMinutes(String(args.time));
    if (proposedMinutes === undefined) return undefined;

    const conflictWindowMins = 60; // events within 1-hour window are considered conflicts

    let events: any[] = [];
    try {
      events = await this.eventsService.getEventsByMonth(familyId, month, year, userId);
    } catch {
      return undefined; // fail open — don't block proposal on DB errors
    }

    const sameDayEvents = (events || []).filter((e) => {
      const eDate = e.date ? new Date(e.date).toISOString().slice(0, 10) : '';
      return eDate === dateStr && e.time;
    });

    const conflict = sameDayEvents.find((e) => {
      const eMinutes = this.timeToMinutes(String(e.time || ''));
      return eMinutes !== undefined && Math.abs(eMinutes - proposedMinutes) < conflictWindowMins;
    });

    if (!conflict) return undefined;

    // Build conflict note with alternative slots
    const occupiedMinutes = new Set(
      sameDayEvents
        .map((e) => this.timeToMinutes(String(e.time || '')))
        .filter((m): m is number => m !== undefined),
    );

    const alternatives = this.findAlternativeSlots(proposedMinutes, occupiedMinutes, conflictWindowMins);
    const conflictWarning = AI_I18N.conflictWarning(
      String(conflict.title || 'sự kiện khác'),
      String(conflict.time || ''),
    );
    const alternativeNote = alternatives.length > 0
      ? AI_I18N.conflictAlternatives(alternatives)
      : AI_I18N.conflictNoAlternative;

    return `${conflictWarning}\n${alternativeNote}`;
  }

  /** Find up to 2 free time slots (before/after the requested time) within business hours. */
  private findAlternativeSlots(
    requestedMinutes: number,
    occupiedMinutes: Set<number>,
    windowMins: number,
  ): string[] {
    const suggestions: string[] = [];
    const candidates = [-90, -60, 60, 90, 120, -120, 30, -30];

    for (const delta of candidates) {
      const candidate = requestedMinutes + delta;
      if (candidate < 7 * 60 || candidate > 21 * 60) continue; // 07:00–21:00 only
      const hasConflict = [...occupiedMinutes].some((m) => Math.abs(m - candidate) < windowMins);
      if (!hasConflict) {
        suggestions.push(this.minutesToTime(candidate));
      }
      if (suggestions.length >= 2) break;
    }
    return suggestions;
  }

  private timeToMinutes(time: string): number | undefined {
    const match = time.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return undefined;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  private minutesToTime(totalMinutes: number): string {
    const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
    const m = (totalMinutes % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
  }
}
