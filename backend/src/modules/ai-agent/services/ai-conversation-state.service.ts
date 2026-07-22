import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface ListedEventMetadata {
  eventId: string;
  date: string;
  time?: string;
  title: string;
  scope: string;
  familyId: string;
  rowNumber: number;
}

export interface ListedNoteMetadata {
  noteId: string;
  title: string;
  familyId: string;
  category: string;
  rowNumber: number;
}

export interface ListedTaskMetadata {
  taskId: string;
  title: string;
  priority: number;
  rowNumber: number;
}

export interface AiConversationStatePayload {
  lastShownEvents?: ListedEventMetadata[];
  lastShownNotes?: ListedNoteMetadata[];
  lastShownTasks?: ListedTaskMetadata[];
  lastSelectedFamilyId?: string;
  lastIntent?: string;
  lastAssistantSummary?: string;
  pendingReference?: Record<string, any>;
}

function toJsonValue(val: any): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return val ?? Prisma.JsonNull;
}

@Injectable()
export class AiConversationStateService {
  private readonly defaultExpiryMinutes = 60; // 60 minutes TTL

  constructor(private readonly prisma: PrismaService) {}

  async getState(userId: string): Promise<AiConversationStatePayload | null> {
    if (!userId) return null;

    const state = await this.prisma.aiConversationState.findUnique({
      where: { userId },
    });

    if (!state) return null;

    // Check if expired
    if (state.expiresAt < new Date()) {
      await this.prisma.aiConversationState.delete({
        where: { userId },
      }).catch(() => {});
      return null;
    }

    return {
      lastShownEvents: (state.lastShownEvents as unknown as ListedEventMetadata[]) || undefined,
      lastShownNotes: (state.lastShownNotes as unknown as ListedNoteMetadata[]) || undefined,
      lastShownTasks: (state.lastShownTasks as unknown as ListedTaskMetadata[]) || undefined,
      lastSelectedFamilyId: state.lastSelectedFamilyId || undefined,
      lastIntent: state.lastIntent || undefined,
      lastAssistantSummary: state.lastAssistantSummary || undefined,
      pendingReference: (state.pendingReference as Record<string, any>) || undefined,
    };
  }

  async saveState(userId: string, payload: AiConversationStatePayload) {
    if (!userId) return;

    const expiresAt = new Date(Date.now() + this.defaultExpiryMinutes * 60 * 1000);

    // Merge with existing non-expired state to avoid losing fields we didn't update this time
    const existing = await this.getState(userId);

    const merged = {
      lastShownEvents: toJsonValue(payload.lastShownEvents ?? existing?.lastShownEvents),
      lastShownNotes: toJsonValue(payload.lastShownNotes ?? existing?.lastShownNotes),
      lastShownTasks: toJsonValue(payload.lastShownTasks ?? existing?.lastShownTasks),
      lastSelectedFamilyId: payload.lastSelectedFamilyId ?? existing?.lastSelectedFamilyId ?? null,
      lastIntent: payload.lastIntent ?? existing?.lastIntent ?? null,
      lastAssistantSummary: payload.lastAssistantSummary ?? existing?.lastAssistantSummary ?? null,
      pendingReference: toJsonValue(payload.pendingReference ?? existing?.pendingReference),
    };

    await this.prisma.aiConversationState.upsert({
      where: { userId },
      update: {
        ...merged,
        expiresAt,
      },
      create: {
        userId,
        ...merged,
        expiresAt,
      },
    });
  }

  async clearState(userId: string) {
    if (!userId) return;
    await this.prisma.aiConversationState.delete({
      where: { userId },
    }).catch(() => {});
  }
}
