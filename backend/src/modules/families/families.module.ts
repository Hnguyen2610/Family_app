import { Module } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { FamiliesController } from './families.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [FamiliesService],
  controllers: [FamiliesController],
  exports: [FamiliesService],
})
export class FamiliesModule {}
