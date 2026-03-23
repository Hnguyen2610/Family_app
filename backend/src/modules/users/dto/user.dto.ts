import { IsString, IsEmail, IsOptional } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  name!: string;

  @IsString()
  familyId!: string;

  @IsString()
  @IsOptional()
  role?: string;

  @IsString()
  @IsOptional()
  birthday?: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  role?: string;

  @IsOptional()
  birthday?: string;
}
