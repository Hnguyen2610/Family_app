import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    PrismaModule,
    EventsModule,
    MealsModule,
    AiAgentModule,
    UsersModule,
    FamiliesModule,
    ScheduleModule.forRoot(),
    MailModule,
    NotificationsModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
