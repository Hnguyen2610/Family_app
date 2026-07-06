import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { DailyTasksService, CreateDailyTaskDto, ReorderDto, UpdateDailyTaskDto } from './daily-tasks.service';

@Controller('api/daily-tasks')
export class DailyTasksController {
  private readonly logger = new Logger(DailyTasksController.name);

  constructor(private readonly dailyTasksService: DailyTasksService) {}

  // ── CRUD ──────────────────────────────────────────────────────────────

  @Get()
  findAll(@Query('userId') userId: string) {
    return this.dailyTasksService.findAll(userId);
  }

  @Post()
  create(@Body() dto: CreateDailyTaskDto) {
    return this.dailyTasksService.create(dto);
  }

  @Patch('reorder')
  reorder(@Body() items: ReorderDto[]) {
    return this.dailyTasksService.reorder(items);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDailyTaskDto) {
    return this.dailyTasksService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.dailyTasksService.remove(id);
  }

  // ── Cron endpoints (protected by CRON_SECRET) ─────────────────────────

  @SkipThrottle()
  @Get('trigger-next')
  async triggerNext(
    @Query('userId') userId: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.verifyCronAuth(authHeader);
    if (!userId) throw new UnauthorizedException('userId is required');
    return this.dailyTasksService.triggerNext(userId);
  }

  @SkipThrottle()
  @Get('reset-daily')
  async resetDaily(
    @Query('userId') userId: string,
    @Headers('authorization') authHeader: string,
  ) {
    this.verifyCronAuth(authHeader);
    if (!userId) throw new UnauthorizedException('userId is required');
    return this.dailyTasksService.resetDaily(userId);
  }

  // ── Helper ────────────────────────────────────────────────────────────

  private verifyCronAuth(authHeader: string) {
    const secret = process.env.CRON_SECRET || 'family-cron-secret-2026';
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
    if (token !== secret) {
      this.logger.warn('Unauthorized cron attempt on daily-tasks');
      throw new UnauthorizedException('Invalid cron secret');
    }
  }
}
