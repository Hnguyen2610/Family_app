import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  async googleAuth(@Body('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Token is required');
    }
    return this.authService.authenticateGoogle(token);
  }
}
