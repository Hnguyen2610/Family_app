import { Module, forwardRef } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './services/finance.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => AiAgentModule),
    forwardRef(() => NotificationsModule),
  ],
  controllers: [FinanceController],
  providers: [FinanceService],
  exports: [FinanceService],
})
export class FinanceModule {}
