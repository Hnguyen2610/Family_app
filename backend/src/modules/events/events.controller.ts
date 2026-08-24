import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { assertFamilyMembership } from '../auth/family-access.util';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('api/events')
@UseGuards(JwtAuthGuard)
export class EventsController {
  constructor(
    private readonly eventsService: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  @Post()
  async create(
    @Request() req: any,
    @Body() dto: CreateEventDto,
    @Query('familyId') familyId: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.eventsService.create(familyId, req.user.id, dto);
  }

  @Get()
  async findAll(
    @Request() req: any,
    @Query('familyId') familyId: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.eventsService.findAll(
      familyId,
      month ? Number.parseInt(month) : undefined,
      year ? Number.parseInt(year) : undefined,
      req.user.id,
    );
  }

  @Get(':id')
  async findById(
    @Request() req: any,
    @Param('id') id: string,
    @Query('familyId') familyId: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.eventsService.findById(id, familyId, req.user.id);
  }

  @Put(':id')
  async update(
    @Request() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Query('familyId') familyId: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.eventsService.update(id, familyId, req.user.id, dto);
  }

  @Delete(':id')
  async delete(
    @Request() req: any,
    @Param('id') id: string,
    @Query('familyId') familyId: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.eventsService.delete(id, familyId, req.user.id);
  }

  @Get('month/:month')
  async getByMonth(
    @Request() req: any,
    @Param('month') month: string,
    @Query('year') year: string,
    @Query('familyId') familyId: string,
  ) {
    await assertFamilyMembership(this.prisma, req.user.id, familyId);
    return this.eventsService.getEventsByMonth(
      familyId,
      Number.parseInt(month),
      Number.parseInt(year),
      req.user.id,
    );
  }
}
