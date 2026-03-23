import { IsString, IsEnum, IsArray, IsOptional } from 'class-validator';
import { MealCategory } from '@prisma/client';

export class CreateMealDto {
  @IsString()
  name!: string;

  @IsEnum(MealCategory)
  category!: MealCategory;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class UpdateMealDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(MealCategory)
  category?: MealCategory;

  @IsOptional()
  @IsArray()
  tags?: string[];
}

export class AddMealPreferenceDto {
  @IsString()
  userId!: string;

  @IsString()
  mealId!: string;
}

export class RecordMealDto {
  @IsString()
  mealId!: string;

  @IsEnum(MealCategory)
  category!: MealCategory;
}

export class AddCustomMealPreferenceDto {
  @IsString()
  userId!: string;

  @IsString()
  mealName!: string;

  @IsEnum(MealCategory)
  category!: MealCategory;
}
