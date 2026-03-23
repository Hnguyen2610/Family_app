import { IsString, IsOptional, IsArray } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  familyId!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  userId?: string;
}

export class GetChatHistoryDto {
  @IsString()
  familyId!: string;

  @IsOptional()
  limit?: number;
}
