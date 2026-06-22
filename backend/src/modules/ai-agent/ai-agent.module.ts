import { Module, forwardRef } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './services/ai-agent.service';
import { ChatService } from './services/chat.service';
import { HoroscopeService } from './services/horoscope.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { MealsModule } from '../meals/meals.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [PrismaModule, forwardRef(() => MealsModule), forwardRef(() => EventsModule)],
  controllers: [AiAgentController],
  providers: [AiAgentService, ChatService, HoroscopeService],
  exports: [AiAgentService, ChatService, HoroscopeService],
})
export class AiAgentModule {}
