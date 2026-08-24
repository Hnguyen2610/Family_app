import { Injectable, UnauthorizedException } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'crypto';

@Injectable()
export class AuthService {
  private readonly googleClient: OAuth2Client;
  private readonly accessTokenTtl = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
  private readonly refreshTokenTtl = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
  private readonly refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {
    if (!this.refreshSecret) {
      throw new Error('JWT_REFRESH_SECRET/JWT_SECRET is not set — refusing to start with an insecure default');
    }
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
        include: { families: true, family: true },
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
        include: { families: true, family: true },
      });

      const tokens = await this.issueTokens(user);

      return {
        user,
        ...tokens,
      };
    } catch (error) {
      console.error('Google Auth Error:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (payload?.type !== 'refresh' || !payload?.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { families: true, family: true },
    });

    if (!user?.refreshTokenHash || !user.refreshTokenExpiresAt) {
      throw new UnauthorizedException('Refresh token has been revoked');
    }

    const tokenHash = this.hashToken(refreshToken);
    const isExpired = user.refreshTokenExpiresAt.getTime() <= Date.now();
    if (user.refreshTokenHash !== tokenHash || isExpired) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokens = await this.issueTokens(user);
    return {
      user,
      ...tokens,
    };
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return { success: true };

    try {
      const payload: any = this.jwtService.verify(refreshToken, { secret: this.refreshSecret });
      if (payload?.sub) {
        await this.prisma.user.update({
          where: { id: payload.sub },
          data: {
            refreshTokenHash: null,
            refreshTokenExpiresAt: null,
          },
        });
      }
    } catch {
      // Logout should be idempotent even when the token is already invalid.
    }

    return { success: true };
  }

  private async issueTokens(user: { id: string; email: string; globalRole: string }) {
    const accessPayload = { sub: user.id, email: user.email, role: user.globalRole };
    const refreshPayload = { sub: user.id, type: 'refresh' };
    const accessToken = this.jwtService.sign(accessPayload, { expiresIn: this.accessTokenTtl as any });
    const refreshToken = this.jwtService.sign(refreshPayload, {
      secret: this.refreshSecret,
      expiresIn: this.refreshTokenTtl as any,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshTokenHash: this.hashToken(refreshToken),
        refreshTokenExpiresAt: this.getRefreshExpiryDate(),
      },
    });

    return { accessToken, refreshToken };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private getRefreshExpiryDate() {
    const match = this.refreshTokenTtl.match(/^(\d+)([smhd])$/);
    const amount = match ? Number.parseInt(match[1], 10) : 30;
    const unit = match?.[2] || 'd';
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + amount * multipliers[unit]);
  }
}
