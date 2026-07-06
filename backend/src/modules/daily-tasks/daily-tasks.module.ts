import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { TelegramModule } from '../telegram/telegram.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DailyTasksService } from './daily-tasks.service';
import { DailyTasksController } from './daily-tasks.controller';

@Module({
  imports: [PrismaModule, TelegramModule, NotificationsModule],
  controllers: [DailyTasksController],
  providers: [DailyTasksService],
  exports: [DailyTasksService],
})
export class DailyTasksModule {}
