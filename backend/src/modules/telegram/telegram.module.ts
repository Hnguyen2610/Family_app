import { Module, forwardRef } from '@nestjs/common';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';

@Module({
  imports: [PrismaModule, forwardRef(() => AiAgentModule)],
  controllers: [TelegramController],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
