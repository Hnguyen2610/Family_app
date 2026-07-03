import { Controller, Post, Get, Body, Query, Delete, Param, Res, Patch, Headers } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { AiAgentService } from './services/ai-agent.service';
import { ChatService } from './services/chat.service';
import { RagService } from './services/rag.service';
import { VisionExtractionService } from './services/vision-extraction.service';
import { ChatMessageDto } from './dto/chat.dto';

@Controller('api/chat')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AiAgentController {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly chatService: ChatService,
    private readonly ragService: RagService,
    private readonly visionExtractionService: VisionExtractionService,
  ) {}

  @Post('message')
  async sendMessage(
    @Body() dto: ChatMessageDto,
  ) {
    const userIds = dto.userId ? [dto.userId] : [];
    let currentSessionId = dto.sessionId;
    if (!currentSessionId) {
      const session = await this.chatService.createSession(
        dto.familyId,
        dto.content.substring(0, 40) + (dto.content.length > 40 ? '...' : '')
      );
      currentSessionId = session.id;
    }

    const result = await this.aiAgentService.chat(
      dto.familyId,
      dto.content,
      userIds,
      dto.image,
      dto.model,
      currentSessionId
    );
    return { ...result, sessionId: currentSessionId };
  }

  @Post('stream')
  async sendMessageStream(
    @Body() dto: ChatMessageDto & { sessionId?: string },
    @Res() res: Response,
  ) {
    const userIds = dto.userId ? [dto.userId] : [];
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    
    let currentSessionId = dto.sessionId;
    if (!currentSessionId) {
      const session = await this.chatService.createSession(
        dto.familyId, 
        dto.content.substring(0, 40) + (dto.content.length > 40 ? '...' : '')
      );
      currentSessionId = session.id;
      res.write(`data: ${JSON.stringify({ type: 'session_id', sessionId: currentSessionId })}\n\n`);
      (res as any).flush?.();
    }
    
    await this.aiAgentService.chatStream(dto.familyId, dto.content, userIds, res, currentSessionId, dto.image, dto.model);
  }

  @SkipThrottle()
  @Get('sessions')
  async getSessions(@Query('familyId') familyId: string) {
    return this.chatService.getSessions(familyId);
  }

  @Delete('sessions/:id')
  async deleteSession(
    @Param('id') id: string,
    @Query('familyId') familyId: string,
  ) {
    return this.chatService.deleteSession(id, familyId);
  }

  @SkipThrottle()
  @Get('history')
  async getHistory(
    @Query('familyId') familyId: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getHistory(familyId, sessionId, limit ? Number.parseInt(limit) : 50);
  }

  @Post('knowledge')
  async createKnowledgeDocument(
    @Body() dto: { familyId: string; title: string; content: string; userId?: string; metadata?: Record<string, any> },
  ) {
    return this.ragService.createKnowledgeDocument({
      familyId: dto.familyId,
      title: dto.title,
      content: dto.content,
      createdBy: dto.userId,
      metadata: dto.metadata,
    });
  }

  @SkipThrottle()
  @Get('knowledge')
  async listKnowledgeDocuments(@Query('familyId') familyId: string) {
    return this.ragService.listKnowledgeDocuments(familyId);
  }

  @SkipThrottle()
  @Get('knowledge/:id')
  async getKnowledgeDocument(
    @Param('id') id: string,
    @Query('familyId') familyId: string,
  ) {
    return this.ragService.getKnowledgeDocument(familyId, id);
  }

  @Patch('knowledge/:id')
  async updateKnowledgeDocument(
    @Param('id') id: string,
    @Query('familyId') familyId: string,
    @Body() dto: { title: string; content: string; metadata?: Record<string, any> },
  ) {
    return this.ragService.updateKnowledgeDocument(familyId, id, dto);
  }

  @Delete('knowledge/:id')
  async deleteKnowledgeDocument(
    @Param('id') id: string,
    @Query('familyId') familyId: string,
  ) {
    return this.ragService.deleteKnowledgeDocument(familyId, id);
  }

  @Post('vision/drafts')
  async createVisionDraft(
    @Body() dto: { familyId: string; userId?: string; image?: string; imageUrl?: string; kind?: 'auto' | 'receipt' | 'medicine' | 'school_plan'; note?: string },
  ) {
    return this.visionExtractionService.createVisionDraft(dto);
  }

  @SkipThrottle()
  @Get('vision/drafts')
  async listVisionDrafts(
    @Query('familyId') familyId: string,
    @Query('status') status?: string,
  ) {
    return this.visionExtractionService.listVisionDrafts(familyId, status);
  }

  @Patch('vision/drafts/:id/status')
  async updateVisionDraftStatus(
    @Param('id') id: string,
    @Query('familyId') familyId: string,
    @Body() dto: { status: 'DRAFT' | 'CONFIRMED' | 'DISMISSED' },
  ) {
    return this.visionExtractionService.updateDraftStatus(familyId, id, dto.status);
  }

  @Post('feedback')
  async addFeedback(
    @Body() dto: {
      requestLogId: string;
      value: 'correct' | 'wrong' | 'missing_context' | 'wrong_family' | 'wrong_datetime';
      source?: 'web' | 'telegram' | 'admin';
      userId?: string;
      comment?: string;
    },
  ) {
    return this.aiAgentService.addFeedback(dto);
  }

  @Delete('history/:familyId')
  async clearHistory(
    @Param('familyId') familyId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.chatService.clearHistory(familyId, sessionId);
  }

  @SkipThrottle()
  @Get('admin/stats')
  async getAdminStats(
    @Headers('x-admin-secret') adminSecret: string,
    @Query('model') model?: string,
    @Query('skill') skill?: string,
    @Query('status') status?: 'ok' | 'error' | 'cached',
    @Query('familyId') familyId?: string,
    @Query('hasRag') hasRag?: 'true' | 'false',
  ) {
    const secret = process.env.CRON_SECRET || 'family-cron-secret-2026';
    if (adminSecret !== secret) return { error: 'Unauthorized' };
    return this.aiAgentService.getSystemStats({ model, skill, status, familyId, hasRag });
  }
}
