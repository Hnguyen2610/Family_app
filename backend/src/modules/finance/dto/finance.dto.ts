import { IsNumber, IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { TransactionType, TransactionCategory } from '@prisma/client';

export class CreateTransactionDto {
  @IsNumber()
  amount!: number;

  @IsEnum(TransactionType)
  type!: TransactionType;

  @IsEnum(TransactionCategory)
  @IsOptional()
  category?: TransactionCategory;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  reference?: string;

  @IsString()
  @IsOptional()
  paymentId?: string;

  @IsDateString()
  @IsOptional()
  date?: string;
}

export class UpdateBudgetDto {
  @IsNumber()
  monthlyIncome!: number;
}
