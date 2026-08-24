import { IsString, IsOptional, IsInt, IsArray, IsBoolean, IsDate, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDailyTaskDto {
  @IsString()
  userId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @IsOptional()
  @IsArray()
  repeatWeekdays?: number[];

  @IsOptional()
  @IsString()
  activeStartTime?: string;

  @IsOptional()
  @IsString()
  activeEndTime?: string;
}

export class UpdateDailyTaskDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  intervalMinutes?: number;

  @IsOptional()
  @IsArray()
  repeatWeekdays?: number[];

  @IsOptional()
  @IsString()
  activeStartTime?: string;

  @IsOptional()
  @IsString()
  activeEndTime?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  completedAt?: Date | null;
}

export class ReorderItemDto {
  @IsString()
  id!: string;

  @IsInt()
  priority!: number;
}
