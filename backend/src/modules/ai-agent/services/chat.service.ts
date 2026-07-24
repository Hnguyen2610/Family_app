import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RagService } from './rag.service';
import { AiAgentService } from './ai-agent.service';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private consolidatingSessions = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ragService: RagService,
    @Inject(forwardRef(() => AiAgentService))
    private readonly aiAgentService: AiAgentService,
  ) {}

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

    const createdMessage = await this.prisma.chatMessage.create({
      data: {
        familyId,
        role,
        content,
        sessionId,
      },
    });

    if (sessionId) {
      // Trigger background memory consolidation
      this.triggerMemoryConsolidationIfNeeded(familyId, sessionId).catch((err) => {
        this.logger.error(`Error in background triggerMemoryConsolidationIfNeeded: ${err}`);
      });
    }

    return createdMessage;
  }

  async getHistory(familyId: string, sessionId?: string, limit: number = 50) {
    const messages = await this.prisma.chatMessage.findMany({
      where: { 
        familyId,
        sessionId: sessionId || null
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const proposalIds: string[] = [];
    for (const msg of messages) {
      const match = msg.content?.match(/<!--\s*action_proposal:([a-zA-Z0-9_-]+)\s*-->/);
      if (match && match[1]) {
        proposalIds.push(match[1]);
      }
    }

    if (proposalIds.length === 0) {
      return messages;
    }

    const proposals = await (this.prisma as any).aiActionProposal.findMany({
      where: { id: { in: proposalIds } },
    });

    const proposalMap = new Map<string, any>(proposals.map((p: any) => [p.id, p]));

    return messages.map((msg) => {
      const match = msg.content?.match(/<!--\s*action_proposal:([a-zA-Z0-9_-]+)\s*-->/);
      if (!match || !match[1]) return msg;

      const prop = proposalMap.get(match[1]);
      if (!prop) return msg;

      const cleanContent = msg.content.replace(/<!--\s*action_proposal:([a-zA-Z0-9_-]+)\s*-->/g, '').trim();
      const statusMap: Record<string, 'pending' | 'confirmed' | 'rejected'> = {
        PENDING: 'pending',
        CONFIRMED: 'confirmed',
        REJECTED: 'rejected',
        EXPIRED: 'rejected',
      };

      return {
        ...msg,
        content: cleanContent,
        proposal: {
          proposalId: prop.id,
          action: prop.action,
          payload: prop.payload,
          summary: prop.payload?.title ? `Tạo sự kiện "${prop.payload.title}" vào ${prop.payload.date}.` : undefined,
          targetType: prop.targetType,
          riskLevel: prop.riskLevel,
          before: prop.before,
          after: prop.after,
        },
        proposalStatus: statusMap[prop.status] || 'pending',
      };
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

  async triggerMemoryConsolidationIfNeeded(familyId: string, sessionId: string, forceDailyClassify: boolean = false) {
    if (this.consolidatingSessions.has(sessionId)) return;

    try {
      const count = await this.prisma.chatMessage.count({
        where: { sessionId },
      });

      // Get the last consolidated document's metadata for this session to prevent duplicate consolidation
      const lastDocs = await this.prisma.aiDocument.findMany({
        where: {
          familyId,
          sourceType: 'memory_consolidation',
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      const sessionDoc = lastDocs.find(
        (doc) => (doc.metadata as any)?.sessionId === sessionId
      );

      const lastMessageCount = sessionDoc ? ((sessionDoc.metadata as any)?.lastMessageCount || 0) : 0;
      const minMessages = forceDailyClassify ? 3 : 15;

      if (count - lastMessageCount < minMessages) return;

      this.consolidatingSessions.add(sessionId);
      this.logger.log(`[MemoryConsolidation] Session ${sessionId} reached ${count} messages. Triggering background consolidation...`);

      const history = await this.prisma.chatMessage.findMany({
        where: { sessionId },
        orderBy: { createdAt: 'asc' },
      });

      const conversationText = history
        .map((m) => `${m.role === 'user' ? 'Thành viên' : 'Trợ lý'}: ${m.content}`)
        .join('\n');

      const systemPrompt = `Bạn là một AI chuyên phân tích đúc kết hội thoại gia đình.
Nhiệm vụ của bạn là đọc lịch sử hội thoại bên dưới và trích xuất các tri thức mới/hữu ích về gia đình này (ví dụ: ngày sinh nhật thành viên, sở thích ăn uống, thói quen đi lại, các nguyên tắc gia đình, món yêu thích, hoặc thông tin cập nhật khác).
Nếu không có thông tin tri thức/thói quen/sở thích nào mới hoặc đáng nhớ, hãy trả về chữ "NO_KNOWLEDGE".
Nếu có thông tin mới, hãy trả về danh sách các sự thật/tri thức mới dưới dạng văn bản tiếng Việt ngắn gọn, dễ đọc, mỗi ý một gạch đầu dòng.`;

      const extracted = await this.aiAgentService.generateBriefingText(
        systemPrompt,
        `Dưới đây là hội thoại gia đình:\n"""\n${conversationText}\n"""`
      );

      if (extracted && extracted.trim() !== 'NO_KNOWLEDGE' && extracted.trim().length > 10) {
        this.logger.log(`[MemoryConsolidation] Extracted memory facts from session ${sessionId}:\n${extracted}`);

        const dateStr = new Date().toISOString().split('T')[0];
        await this.ragService.createKnowledgeDocument({
          familyId,
          title: `Ký ức đúc kết từ hội thoại ngày ${dateStr}`,
          content: extracted.trim(),
          sourceType: 'memory_consolidation',
          metadata: {
            sessionId,
            consolidatedAt: new Date().toISOString(),
            lastMessageCount: count,
          },
        });

        this.logger.log(`[MemoryConsolidation] Memory successfully consolidated into pgvector RAG for familyId=${familyId}`);
      } else {
        this.logger.log(`[MemoryConsolidation] No new knowledge extracted from session ${sessionId}`);
      }
    } catch (error) {
      this.logger.error(`[MemoryConsolidation] Failed to consolidate memory: ${error}`);
    } finally {
      this.consolidatingSessions.delete(sessionId);
    }
  }

  @Cron('0 22 * * *')
  async consolidateAllActiveSessions() {
    this.logger.log('[MemoryConsolidation] Running scheduled last-of-day memory consolidation...');
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const activeSessions = await this.prisma.chatSession.findMany({
        where: {
          updatedAt: { gte: oneDayAgo },
        },
      });

      for (const session of activeSessions) {
        await this.triggerMemoryConsolidationIfNeeded(session.familyId, session.id, true);
      }
    } catch (err) {
      this.logger.error(`[MemoryConsolidation] Failed scheduled consolidation: ${err}`);
    }
  }
}
