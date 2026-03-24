import { Controller, Post, Get, Body, Query, Delete, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { AiAgentService } from './services/ai-agent.service';
import { ChatService } from './services/chat.service';
import { ChatMessageDto } from './dto/chat.dto';

@Controller('api/chat')
export class AiAgentController {
  constructor(
    private readonly aiAgentService: AiAgentService,
    private readonly chatService: ChatService,
  ) {}

  @Post('message')
  async sendMessage(
    @Body() dto: ChatMessageDto,
  ) {
    const userIds = dto.userId ? [dto.userId] : [];
    return this.aiAgentService.chat(dto.familyId, dto.content, userIds, dto.image, dto.model);
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
    
    let currentSessionId = dto.sessionId;
    if (!currentSessionId) {
      const session = await this.chatService.createSession(
        dto.familyId, 
        dto.content.substring(0, 40) + (dto.content.length > 40 ? '...' : '')
      );
      currentSessionId = session.id;
      res.write(`data: ${JSON.stringify({ type: 'session_id', sessionId: currentSessionId })}\n\n`);
    }
    
    await this.aiAgentService.chatStream(dto.familyId, dto.content, userIds, res, currentSessionId, dto.image, dto.model);
  }

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

  @Get('history')
  async getHistory(
    @Query('familyId') familyId: string,
    @Query('sessionId') sessionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getHistory(familyId, sessionId, limit ? Number.parseInt(limit) : 50);
  }

  @Delete('history/:familyId')
  async clearHistory(
    @Param('familyId') familyId: string,
    @Query('sessionId') sessionId?: string,
  ) {
    return this.chatService.clearHistory(familyId, sessionId);
  }
}
