import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeSearchText } from './ai-intent-router';
import { AiConversationStateService } from './services/ai-conversation-state.service';

export interface ResolvedEntity {
  id: string;
  type: 'event' | 'note' | 'task';
  title: string;
  confidence: number;
  resolverType: 'row_number' | 'exact_title' | 'partial_title' | 'pronoun' | 'database_search';
}

export type ResolverTelemetry = {
  resolverType?: ResolvedEntity['resolverType'];
  candidateCount: number;
  confidence?: number;
  selectedEntityId?: string;
};

type ResolutionResult = {
  resolved: ResolvedEntity | null;
  candidates: ResolvedEntity[];
  telemetry: ResolverTelemetry;
};

const NUMBER_WORDS: Record<string, number> = {
  nhat: 1,
  mot: 1,
  hai: 2,
  ba: 3,
  tu: 4,
  bon: 4,
  nam: 5,
};

const REFERENCE_PRONOUNS = [
  'cai nay',
  'cai do',
  'do',
  'no',
  'su kien nay',
  'su kien do',
  'ghi chu nay',
  'ghi chu do',
  'task nay',
  'task do',
  'nhiem vu nay',
  'nhiem vu do',
];

@Injectable()
export class AiEntityResolver {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stateService: AiConversationStateService,
  ) {}

  private extractRowNumber(message: string): number | null {
    const text = normalizeSearchText(message);
    const patterns = [
      /\b(?:dong|muc|so)\s+(?:so\s+)?(\d+|nhat|mot|hai|ba|tu|bon|nam)\b/i,
      /\b(?:su kien|ghi chu|task|nhiem vu)\s+thu\s+(\d+|nhat|mot|hai|ba|tu|bon|nam)\b/i,
      /\bthu\s+(\d+|nhat|mot|hai|ba|tu|bon|nam)\b/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      const value = match?.[1];
      if (!value) continue;
      if (/^\d+$/.test(value)) return Number.parseInt(value, 10);
      const mapped = NUMBER_WORDS[value];
      if (mapped) return mapped;
    }

    const shortMatch = text.match(/^\s*(?:xoa|sua|update|delete|choose|chon)\s+(\d+)\s*$/i);
    return shortMatch ? Number.parseInt(shortMatch[1], 10) : null;
  }

  private hasReferencePronoun(message: string): boolean {
    const text = normalizeSearchText(message);
    return REFERENCE_PRONOUNS.some((pronoun) => text.includes(pronoun));
  }

  private toEventEntity(event: { eventId: string; title: string }, confidence: number, resolverType: ResolvedEntity['resolverType']): ResolvedEntity {
    return {
      id: event.eventId,
      type: 'event',
      title: event.title,
      confidence,
      resolverType,
    };
  }

  private toNoteEntity(note: { noteId: string; title: string }, confidence: number, resolverType: ResolvedEntity['resolverType']): ResolvedEntity {
    return {
      id: note.noteId,
      type: 'note',
      title: note.title,
      confidence,
      resolverType,
    };
  }

  private toTaskEntity(task: { taskId: string; title: string }, confidence: number, resolverType: ResolvedEntity['resolverType']): ResolvedEntity {
    return {
      id: task.taskId,
      type: 'task',
      title: task.title,
      confidence,
      resolverType,
    };
  }

  private buildTelemetry(resolved: ResolvedEntity | null, candidates: ResolvedEntity[]): ResolverTelemetry {
    return {
      resolverType: resolved?.resolverType,
      candidateCount: candidates.length,
      confidence: resolved?.confidence,
      selectedEntityId: resolved?.id,
    };
  }

  private pickBest(candidates: ResolvedEntity[]): ResolutionResult {
    candidates.sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];

    if (!best) {
      return { resolved: null, candidates, telemetry: this.buildTelemetry(null, candidates) };
    }
    if (best.confidence < 0.7) {
      return { resolved: null, candidates, telemetry: this.buildTelemetry(null, candidates) };
    }
    if (candidates.length === 1 || best.confidence - candidates[1].confidence >= 0.15) {
      return { resolved: best, candidates, telemetry: this.buildTelemetry(best, candidates) };
    }

    return { resolved: null, candidates, telemetry: this.buildTelemetry(null, candidates) };
  }

  async resolveEvent(userId: string, message: string, familyId?: string): Promise<ResolutionResult> {
    const state = await this.stateService.getState(userId);
    const listedEvents = state?.lastShownEvents || [];

    const rowNumber = this.extractRowNumber(message);
    if (rowNumber !== null) {
      const match = listedEvents.find((event) => event.rowNumber === rowNumber);
      if (match) {
        const entity = this.toEventEntity(match, 0.95, 'row_number');
        return { resolved: entity, candidates: [entity], telemetry: this.buildTelemetry(entity, [entity]) };
      }
    }

    if (this.hasReferencePronoun(message)) {
      if (listedEvents.length === 1) {
        const entity = this.toEventEntity(listedEvents[0], 0.9, 'pronoun');
        return { resolved: entity, candidates: [entity], telemetry: this.buildTelemetry(entity, [entity]) };
      }
      if (listedEvents.length > 1) {
        const candidates = listedEvents.map((event) => this.toEventEntity(event, 0.5, 'pronoun'));
        return {
          resolved: null,
          candidates,
          telemetry: this.buildTelemetry(null, candidates),
        };
      }
    }

    const normalizedMessage = normalizeSearchText(message);
    const candidates = this.findTextMatches(
      listedEvents.map((event) => ({ id: event.eventId, title: event.title })),
      normalizedMessage,
      'event',
    );

    if (candidates.length === 0) {
      candidates.push(...await this.findEventMatchesFromDatabase(userId, normalizedMessage, familyId));
    }

    return this.pickBest(candidates);
  }

  async resolveNote(userId: string, message: string): Promise<ResolutionResult> {
    const state = await this.stateService.getState(userId);
    const listedNotes = state?.lastShownNotes || [];

    const rowNumber = this.extractRowNumber(message);
    if (rowNumber !== null) {
      const match = listedNotes.find((note) => note.rowNumber === rowNumber);
      if (match) {
        const entity = this.toNoteEntity(match, 0.95, 'row_number');
        return { resolved: entity, candidates: [entity], telemetry: this.buildTelemetry(entity, [entity]) };
      }
    }

    if (this.hasReferencePronoun(message) && listedNotes.length === 1) {
      const entity = this.toNoteEntity(listedNotes[0], 0.9, 'pronoun');
      return { resolved: entity, candidates: [entity], telemetry: this.buildTelemetry(entity, [entity]) };
    }

    const candidates = this.findTextMatches(
      listedNotes.map((note) => ({ id: note.noteId, title: note.title })),
      normalizeSearchText(message),
      'note',
    );

    return this.pickBest(candidates);
  }

  async resolveTask(userId: string, message: string): Promise<ResolutionResult> {
    const state = await this.stateService.getState(userId);
    const listedTasks = state?.lastShownTasks || [];

    const rowNumber = this.extractRowNumber(message);
    if (rowNumber !== null) {
      const match = listedTasks.find((task) => task.rowNumber === rowNumber);
      if (match) {
        const entity = this.toTaskEntity(match, 0.95, 'row_number');
        return { resolved: entity, candidates: [entity], telemetry: this.buildTelemetry(entity, [entity]) };
      }
    }

    if (this.hasReferencePronoun(message) && listedTasks.length === 1) {
      const entity = this.toTaskEntity(listedTasks[0], 0.9, 'pronoun');
      return { resolved: entity, candidates: [entity], telemetry: this.buildTelemetry(entity, [entity]) };
    }

    const candidates = this.findTextMatches(
      listedTasks.map((task) => ({ id: task.taskId, title: task.title })),
      normalizeSearchText(message),
      'task',
    );

    if (candidates.length === 0) {
      candidates.push(...await this.findTaskMatchesFromDatabase(userId, normalizeSearchText(message)));
    }

    return this.pickBest(candidates);
  }

  private findTextMatches(
    items: Array<{ id: string; title: string }>,
    normalizedMessage: string,
    type: 'event' | 'note' | 'task',
  ): ResolvedEntity[] {
    const candidates: ResolvedEntity[] = [];

    for (const item of items) {
      const normalizedTitle = normalizeSearchText(item.title);
      if (!normalizedTitle || normalizedTitle.length <= 3) continue;

      if (normalizedMessage.includes(normalizedTitle)) {
        candidates.push({
          id: item.id,
          type,
          title: item.title,
          confidence: 0.85,
          resolverType: 'exact_title',
        });
        continue;
      }

      const titleWords = normalizedTitle.split(/\s+/).filter((word) => word.length > 2);
      const matchCount = titleWords.filter((word) => normalizedMessage.includes(word)).length;
      if (titleWords.length > 0 && matchCount >= titleWords.length * 0.6) {
        candidates.push({
          id: item.id,
          type,
          title: item.title,
          confidence: 0.6 + (matchCount / titleWords.length) * 0.2,
          resolverType: 'partial_title',
        });
      }
    }

    return candidates;
  }

  private async findEventMatchesFromDatabase(
    userId: string,
    normalizedMessage: string,
    familyId?: string,
  ): Promise<ResolvedEntity[]> {
    const scopedWhere: Prisma.EventWhereInput = familyId && familyId !== 'all'
      ? {
          familyId,
          OR: [{ createdBy: userId }, { scope: 'FAMILY' }],
        }
      : {
          createdBy: userId,
        };

    const dbEvents = await this.prisma.event.findMany({
      where: scopedWhere,
      orderBy: { date: 'desc' },
      take: 30,
    });

    return this.findTextMatches(
      dbEvents.map((event) => ({ id: event.id, title: event.title })),
      normalizedMessage,
      'event',
    ).map((candidate) => ({ ...candidate, resolverType: 'database_search', confidence: 0.8 }));
  }

  private async findTaskMatchesFromDatabase(
    userId: string,
    normalizedMessage: string,
  ): Promise<ResolvedEntity[]> {
    const dbTasks = await this.prisma.dailyTask.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return this.findTextMatches(
      dbTasks.map((task: any) => ({ id: task.id, title: task.title })),
      normalizedMessage,
      'task',
    ).map((candidate) => ({ ...candidate, resolverType: 'database_search', confidence: 0.8 }));
  }
}
