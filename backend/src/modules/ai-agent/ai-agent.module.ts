import { Module, forwardRef } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './services/ai-agent.service';
import { ChatService } from './services/chat.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { MealsModule } from '../meals/meals.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, forwardRef(() => MealsModule), forwardRef(() => EventsModule)],
  controllers: [AiAgentController],
  providers: [AiAgentService, ChatService],
  exports: [AiAgentService, ChatService],
})
export class AiAgentModule {}
