import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    this.googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }

  async authenticateGoogle(token: string) {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        throw new UnauthorizedException('Invalid Google token');
      }

      const { sub: googleId, email, picture: avatarUrl } = payload;

      // Find or create user
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { googleId },
            { email },
          ],
        },
        include: { family: true },
      });

      if (!existingUser) {
        // Restricted Login: Only allow pre-registered emails
        console.warn(`Blocked unauthorized login attempt: ${email}`);
        throw new UnauthorizedException('Email này chưa được đăng ký trong hệ thống gia đình. Vui lòng liên hệ quản trị viên.');
      }

      // Update user if needed (googleId, name, avatar, or role)
      const isSuperAdmin = email === 'hnguyen261002@gmail.com';
      const user = await this.prisma.user.update({
        where: { id: existingUser.id },
        data: {
          name: payload.name || existingUser.name,
          googleId: existingUser.googleId || googleId,
          avatarUrl: avatarUrl || existingUser.avatarUrl,
          globalRole: isSuperAdmin ? 'SUPER_ADMIN' : existingUser.globalRole || 'USER',
        },
        include: { family: true },
      });

      const payload_jwt = { sub: user.id, email: user.email, role: user.globalRole };
      const accessToken = this.jwtService.sign(payload_jwt);

      return {
        user,
        accessToken,
      };
    } catch (error) {
      console.error('Google Auth Error:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
