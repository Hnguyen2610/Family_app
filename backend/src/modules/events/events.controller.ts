import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto, UpdateEventDto } from './dto/event.dto';

@Controller('api/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  create(
    @Body() dto: CreateEventDto,
    @Query('familyId') familyId: string,
    @Query('userId') userId: string,
  ) {
    return this.eventsService.create(familyId, userId, dto);
  }

  @Get()
  findAll(
    @Query('familyId') familyId: string,
    @Query('userId') userId?: string,
    @Query('month') month?: string,
    @Query('year') year?: string,
  ) {
    return this.eventsService.findAll(
      familyId,
      month ? Number.parseInt(month) : undefined,
      year ? Number.parseInt(year) : undefined,
      userId,
    );
  }

  @Get(':id')
  findById(
    @Param('id') id: string,
    @Query('familyId') familyId: string,
    @Query('userId') userId?: string,
  ) {
    return this.eventsService.findById(id, familyId, userId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
    @Query('familyId') familyId: string,
    @Query('userId') userId: string,
  ) {
    return this.eventsService.update(id, familyId, userId, dto);
  }

  @Delete(':id')
  delete(
    @Param('id') id: string, 
    @Query('familyId') familyId: string,
    @Query('userId') userId: string,
  ) {
    return this.eventsService.delete(id, familyId, userId);
  }

  @Get('month/:month')
  getByMonth(
    @Param('month') month: string,
    @Query('year') year: string,
    @Query('familyId') familyId: string,
    @Query('userId') userId?: string,
  ) {
    return this.eventsService.getEventsByMonth(
      familyId,
      Number.parseInt(month),
      Number.parseInt(year),
      userId,
    );
  }
}
