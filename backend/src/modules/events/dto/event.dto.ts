import { IsString, IsOptional, IsEnum, IsDate, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { EventType, EventScope } from '@prisma/client';

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
  time?: string;

  @IsOptional()
  @IsString()
  lunarDate?: string;

  @IsEnum(EventType)
  @IsOptional()
  type?: EventType = EventType.GENERAL;

  @IsEnum(EventScope)
  @IsOptional()
  scope?: EventScope = EventScope.GLOBAL;

  @IsOptional()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurring?: string;

  @IsOptional()
  useLunar?: boolean;

  @IsOptional()
  @IsString()
  familyId?: string;

  @IsOptional()
  @IsString()
  creatorId?: string;
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
  time?: string;

  @IsOptional()
  @IsString()
  lunarDate?: string;

  @IsOptional()
  @IsEnum(EventType)
  type?: EventType;

  @IsOptional()
  @IsEnum(EventScope)
  scope?: EventScope;

  @IsOptional()
  isRecurring?: boolean;

  @IsOptional()
  @IsString()
  recurring?: string;

  @IsOptional()
  useLunar?: boolean;

  @IsOptional()
  @IsString()
  familyId?: string;

  @IsOptional()
  @IsString()
  creatorId?: string;
}
