import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  async createSession(familyId: string, title: string) {
    return this.prisma.chatSession.create({
      data: { familyId, title },
    });
  }

  async getSessions(familyId: string) {
    return this.prisma.chatSession.findMany({
      where: { familyId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async deleteSession(sessionId: string, familyId: string) {
    return this.prisma.chatSession.deleteMany({
      where: { id: sessionId, familyId },
    });
  }

  async saveMessage(familyId: string, role: 'user' | 'assistant', content: string, sessionId?: string) {
    // If sessionId is provided, also update the session's updatedAt time
    if (sessionId) {
      await this.prisma.chatSession.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      }).catch(() => {});
    }

    return this.prisma.chatMessage.create({
      data: {
        familyId,
        role,
        content,
        sessionId,
      },
    });
  }

  async getHistory(familyId: string, sessionId?: string, limit: number = 50) {
    return this.prisma.chatMessage.findMany({
      where: { 
        familyId,
        sessionId: sessionId || null
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async clearHistory(familyId: string, sessionId?: string) {
    return this.prisma.chatMessage.deleteMany({
      where: { 
        familyId,
        sessionId: sessionId || null
      },
    });
  }
}
