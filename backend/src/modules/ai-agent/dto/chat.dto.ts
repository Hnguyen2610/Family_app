import { IsString, IsOptional } from 'class-validator';

export class ChatMessageDto {
  @IsString()
  familyId!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class GetChatHistoryDto {
  @IsString()
  familyId!: string;

  @IsOptional()
  limit?: number;
}
