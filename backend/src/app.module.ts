import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { EventsModule } from './modules/events/events.module';
import { MealsModule } from './modules/meals/meals.module';
import { AiAgentModule } from './modules/ai-agent/ai-agent.module';
import { UsersModule } from './modules/users/users.module';
import { ScheduleModule } from '@nestjs/schedule';
import { MailModule } from './modules/mail/mail.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuthModule } from './modules/auth/auth.module';
import { FamiliesModule } from './modules/families/families.module';
import { FinanceModule } from './modules/finance/finance.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,  // 1 minute window
        limit: 60,   // 60 req/min for general endpoints
      },
      {
        name: 'ai',
        ttl: 60000,  // 1 minute window
        limit: 20,   // 20 req/min for AI endpoints
      },
    ]),
    PrismaModule,
    EventsModule,
    MealsModule,
    AiAgentModule,
    UsersModule,
    FamiliesModule,
    FinanceModule,
    ScheduleModule.forRoot(),
    MailModule,
    NotificationsModule,
    AuthModule,
    TelegramModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
