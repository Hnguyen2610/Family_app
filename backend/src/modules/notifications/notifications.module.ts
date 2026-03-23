import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [MailModule, PrismaModule, EventsModule],
  providers: [NotificationsService],
})
export class NotificationsModule {}
