import { Module, forwardRef } from '@nestjs/common';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { WeatherModule } from '../weather/weather.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { FootballModule } from '../football/football.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramSender } from './services/telegram-sender';
import { TelegramContextService } from './services/telegram-context.service';
import { TelegramAiResponder } from './services/telegram-ai-responder.service';
import { TelegramFamilyNoteService } from './services/telegram-family-note.service';
import { TelegramFootballNotificationService } from './services/telegram-football-notification.service';
import { TelegramCommandHandlers } from './handlers/telegram-command-handlers';
import { TelegramActionHandlers } from './handlers/telegram-action-handlers';
import { TelegramMessageHandlers } from './handlers/telegram-message-handlers';

@Module({
  imports: [PrismaModule, WeatherModule, FootballModule, forwardRef(() => AiAgentModule)],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    TelegramSender,
    TelegramContextService,
    TelegramAiResponder,
    TelegramFamilyNoteService,
    TelegramFootballNotificationService,
    TelegramCommandHandlers,
    TelegramActionHandlers,
    TelegramMessageHandlers,
  ],
  exports: [
    TelegramService,
    TelegramSender,
    TelegramContextService,
    TelegramAiResponder,
    TelegramFamilyNoteService,
    TelegramFootballNotificationService,
  ],
})
export class TelegramModule {}
