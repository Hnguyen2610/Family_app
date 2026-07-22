import { Module, forwardRef } from '@nestjs/common';
import { AiAgentController } from './ai-agent.controller';
import { AiAgentService } from './services/ai-agent.service';
import { ChatService } from './services/chat.service';
import { HoroscopeService } from './services/horoscope.service';
import { RagService } from './services/rag.service';
import { VisionExtractionService } from './services/vision-extraction.service';
import { AiActionProposalService } from './services/ai-action-proposal.service';
import { AiConversationStateService } from './services/ai-conversation-state.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { MealsModule } from '../meals/meals.module';
import { EventsModule } from '../events/events.module';
import { MarketSkill } from './skills/market.skill';
import { GeneralChatSkill } from './skills/general-chat.skill';
import { MealSkill } from './skills/meal.skill';
import { CalendarSkill } from './skills/calendar.skill';
import { HoroscopeSkill as HoroscopeAiSkill } from './skills/horoscope.skill';
import { FamilyKnowledgeSkill } from './skills/family-knowledge.skill';
import { FootballSkill } from './skills/football.skill';
import { WeatherSkill } from './skills/weather.skill';
import { SearchSkill } from './skills/search.skill';
import { AiSkillRegistry } from './skills/ai-skill-registry';
import { WeatherModule } from '../weather/weather.module';
import { AiFamilyResolver } from './ai-family-resolver';
import { AiEntityResolver } from './ai-entity-resolver';
import { AiStructuredActionHandler } from './ai-structured-action-handler';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => MealsModule),
    forwardRef(() => EventsModule),
    WeatherModule,
  ],
  controllers: [AiAgentController],
  providers: [
    AiAgentService,
    ChatService,
    HoroscopeService,
    RagService,
    VisionExtractionService,
    AiActionProposalService,
    AiConversationStateService,
    MarketSkill,
    GeneralChatSkill,
    MealSkill,
    CalendarSkill,
    HoroscopeAiSkill,
    FamilyKnowledgeSkill,
    FootballSkill,
    WeatherSkill,
    SearchSkill,
    AiSkillRegistry,
    AiFamilyResolver,
    AiEntityResolver,
    AiStructuredActionHandler,
  ],
  exports: [AiAgentService, ChatService, HoroscopeService, RagService, VisionExtractionService, AiActionProposalService, AiConversationStateService, AiEntityResolver, AiSkillRegistry, FootballSkill, WeatherSkill, SearchSkill],
})
export class AiAgentModule {}
