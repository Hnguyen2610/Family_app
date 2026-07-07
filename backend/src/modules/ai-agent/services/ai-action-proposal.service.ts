import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { AiSkillContext } from '../interfaces/ai-skill.interface';
import { EventsService } from '../../events/events.service';
import { RagService } from './rag.service';
import { parseCalendarDate, parseCalendarDateRange } from '../ai-date-parser';

export type AiActionProposalSource = 'web' | 'telegram';
export type AiActionProposalAction =
  | 'create_event'
  | 'update_event'
  | 'delete_event'
  | 'create_task'
  | 'save_note';

export interface CreateAiActionProposalInput {
  userId: string;
  familyId?: string;
  source: AiActionProposalSource;
  action: AiActionProposalAction;
  payload: Record<string, unknown>;
  expiresAt?: Date;
}

const TOOL_ACTION_MAP: Record<string, AiActionProposalAction> = {
  createEvent: 'create_event',
  updateEvent: 'update_event',
  deleteEvent: 'delete_event',
  createWikiEntry: 'save_note',
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

    const expiresAt = input.expiresAt ?? this.getDefaultExpiry();

    return this.proposals.create({
      data: {
        userId: input.userId,
        familyId: input.familyId,
        source: input.source,
        action: input.action,
        payload: input.payload,
        status: 'PENDING',
        expiresAt,
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
    const payload = {
      toolName,
      args: normalizedArgs,
      familyId,
      userId: context.userId,
    };

    const proposal = await this.createProposal({
      userId: context.userId,
      familyId,
      source: context.source || 'web',
      action,
      payload,
    });

    return {
      type: 'action_proposal',
      proposalId: proposal.id,
      action,
      payload,
      message: 'Mình đã chuẩn bị thao tác này. Bạn xác nhận trước khi lưu nhé.',
    };
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
      throw new NotFoundException('Proposal not found');
    }

    if (proposal.expiresAt < new Date()) {
      throw new BadRequestException('Proposal expired');
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
      const eventId = String(args.id || '');
      if (!eventId) throw new BadRequestException('Event id is required');
      return this.eventsService!.update(eventId, familyId, userId, this.stripToolOnlyEventArgs(args) as any);
    }

    if (proposal.action === 'delete_event') {
      this.assertEventsService();
      const eventId = String(args.id || '');
      if (!eventId) throw new BadRequestException('Event id is required');
      return this.eventsService!.delete(eventId, familyId, userId);
    }

    if (proposal.action === 'save_note') {
      this.assertRagService();
      const title = String(args.title || '').trim();
      const content = String(args.content || title).trim();
      if (!title || !content) throw new BadRequestException('Note title and content are required');
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

  private get proposals() {
    return (this.prisma as any).aiActionProposal;
  }
}
