import { IsString, IsOptional, IsEnum, IsDate } from 'class-validator';
import { Type } from 'class-transformer';
import { EventType } from '@prisma/client';

export class CreateEventDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsDate()
  @Type(() => Date)
  date!: Date;

  @IsOptional()
  @IsString()
  lunarDate?: string;

  @IsEnum(EventType)
  @IsOptional()
  type?: EventType = EventType.GENERAL;

  @IsOptional()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurring?: string;
}

export class UpdateEventDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  date?: Date;

  @IsOptional()
  @IsString()
  lunarDate?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurring?: string;
}
