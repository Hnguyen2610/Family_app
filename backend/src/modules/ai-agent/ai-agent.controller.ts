import { Controller, Post, Get, Body, Query, Delete, Param, Res, Patch, Headers, UseGuards, UnauthorizedException, Logger } from '@nestjs/common';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { AiAgentService } from './services/ai-agent.service';
import { ChatService } from './services/chat.service';
import { RagService } from './services/rag.service';
import { VisionExtractionService } from './services/vision-extraction.service';
import { AiActionProposalService } from './services/ai-action-proposal.service';
import { AiEvalService } from './services/ai-eval.service';
import { AiStatsService } from './services/ai-stats.service';
import { ChatMessageDto } from './dto/chat.dto';
import { AdminAuthGuard } from '../auth/guards/admin-auth.guard';

@Controller('api/chat')
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class AiAgentController {
  private readonly logger = new Logger(AiAgentController.name);

  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly chatService: ChatService,
    private readonly ragService: RagService,
    private readonly visionExtractionService: VisionExtractionService,
    private readonly actionProposalService: AiActionProposalService,
    private readonly aiEvalService: AiEvalService,
    private readonly aiStatsService: AiStatsService,
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

  @SkipThrottle()
  @Get('knowledge/:id/versions')
  async getKnowledgeDocumentVersions(
    @Param('id') id: string,
  ) {
    return this.ragService.getDocumentVersions(id);
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

  @SkipThrottle()
  @Post('knowledge/check-duplicate')
  async checkDuplicate(
    @Body() dto: { familyId: string; title: string; content: string },
  ) {
    return this.ragService.checkDuplicateDocument(dto.familyId, dto.title, dto.content);
  }

  @SkipThrottle()
  @Get('knowledge/backfill-embeddings')
  async backfillEmbeddings(
    @Headers('x-vercel-cron-auth') customAuth: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.verifyCronAuth(customAuth, authHeader);
    return this.ragService.backfillMissingEmbeddings();
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
    return this.aiStatsService.addFeedback(dto);
  }

  @Delete('history/:familyId')
  async clearHistory(
    @Param('familyId') familyId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.chatService.clearHistory(familyId, sessionId);
  }

  @Post('proposals/:id/confirm')
  async confirmProposal(
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    return this.actionProposalService.confirm(id, userId);
  }

  @Post('proposals/:id/reject')
  async rejectProposal(
    @Param('id') id: string,
    @Body('userId') userId: string,
  ) {
    return this.actionProposalService.reject(id, userId);
  }

  @SkipThrottle()
  @Post('admin/eval-drafts')
  @UseGuards(AdminAuthGuard)
  async createEvalDraft(
    @Body() dto: {
      requestLogId: string;
      group?: string;
      expectedIntent?: string;
      expectedSkill?: string;
      expectedFamilyId?: string;
      note?: string;
    },
  ) {
    return this.aiEvalService.createEvalDraftFromLog(dto);
  }

  @SkipThrottle()
  @Get('admin/eval-cases')
  @UseGuards(AdminAuthGuard)
  async getEvalCases() {
    return this.aiEvalService.getEvalCases();
  }

  @SkipThrottle()
  @Post('admin/eval-cases/run')
  @UseGuards(AdminAuthGuard)
  async runEvalCases() {
    return this.aiEvalService.runEvalCases();
  }

  @SkipThrottle()
  @Patch('admin/eval-cases/:id')
  @UseGuards(AdminAuthGuard)
  async updateEvalCase(
    @Param('id') id: string,
    @Body() data: any,
  ) {
    return this.aiEvalService.updateEvalCase(id, data);
  }

  @SkipThrottle()
  @Delete('admin/eval-cases/:id')
  @UseGuards(AdminAuthGuard)
  async deleteEvalCase(
    @Param('id') id: string,
  ) {
    return this.aiEvalService.deleteEvalCase(id);
  }

  @SkipThrottle()
  @Get('admin/stats')
  @UseGuards(AdminAuthGuard)
  async getAdminStats(
    @Query('model') model?: string,
    @Query('skill') skill?: string,
    @Query('status') status?: 'ok' | 'error' | 'cached',
    @Query('familyId') familyId?: string,
    @Query('hasRag') hasRag?: 'true' | 'false',
  ) {
    return this.aiStatsService.getSystemStats({ model, skill, status, familyId, hasRag });
  }

  private verifyCronAuth(customAuth: string, authHeader: string) {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      this.logger.warn('CRON_SECRET is not set — rejecting cron endpoint request');
      throw new UnauthorizedException('Cron auth not configured');
    }

    if (customAuth === cronSecret) return;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      if (token === cronSecret) return;
    }

    if (authHeader === cronSecret) return;

    this.logger.warn('Unauthorized attempt to trigger cron endpoint (missing or invalid credentials)');
    throw new UnauthorizedException('Invalid cron secret');
  }
}
