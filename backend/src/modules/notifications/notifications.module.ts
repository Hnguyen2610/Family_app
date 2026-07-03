import { Module, forwardRef } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventsModule } from '../events/events.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { FinanceModule } from '../finance/finance.module';
import { WebPushService } from './web-push.service';
import { TelegramModule } from '../telegram/telegram.module';
import { WeatherModule } from '../weather/weather.module';

@Module({
  imports: [
    MailModule, 
    PrismaModule, 
    TelegramModule,
    WeatherModule,
    forwardRef(() => EventsModule), 
    forwardRef(() => AiAgentModule),
    forwardRef(() => FinanceModule)
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, WebPushService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
