import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class AdminAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const adminSecret = request.headers['x-admin-secret'];
    const secret = process.env.CRON_SECRET || 'family-cron-secret-2026';

    // 1. If static secret matches, allow access immediately (for legacy/cron compatibility)
    if (adminSecret && adminSecret === secret) {
      return true;
    }

    // 2. Otherwise execute standard JWT validation flow via AuthGuard('jwt')
    try {
      const authorized = await super.canActivate(context);
      if (!authorized) return false;
    } catch (err: any) {
      throw new UnauthorizedException(err.message || 'Invalid or expired authorization token');
    }

    // 3. Perform additional role validation on the authenticated user
    const { user } = request;
    if (!user) {
      throw new UnauthorizedException('Authentication failed');
    }

    const globalRole = String(user.globalRole || '').toUpperCase();
    const role = String(user.role || '').toLowerCase();
    const isAdmin = globalRole === 'ADMIN' || globalRole === 'SUPER_ADMIN' || role === 'admin' || role === 'super_admin';

    if (!isAdmin) {
      throw new UnauthorizedException('Admin privileges required');
    }

    return true;
  }
}
