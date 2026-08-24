import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Verifies the authenticated user belongs to familyId before a family-scoped read/write
 * proceeds. familyId === 'all' is skipped — callers that accept 'all' already fan out to
 * the caller's own families internally (see events.service.ts / meals.service.ts).
 */
export async function assertFamilyMembership(prisma: PrismaService, userId: string, familyId: string) {
  if (!familyId || familyId === 'all') return;

  const member = await prisma.user.findFirst({
    where: { id: userId, families: { some: { id: familyId } } },
    select: { id: true },
  });

  if (!member) {
    throw new ForbiddenException('Not a member of this family');
  }
}

/**
 * Verifies the authenticated user may act on targetUserId's data — either because they are
 * the same user, or because they share at least one family (e.g. a parent managing a child's
 * meal preferences).
 */
/**
 * Returns the ids of every family userId belongs to (many-to-many `families` relation).
 * Used to fan out 'all families' reads for a user across events/meals/users.
 */
export async function resolveUserFamilyIds(prisma: PrismaService, userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { families: { select: { id: true } } },
  });
  return user?.families.map((f) => f.id) || [];
}

export async function assertSameFamily(prisma: PrismaService, userId: string, targetUserId: string) {
  if (!targetUserId || userId === targetUserId) return;

  const shared = await prisma.user.findFirst({
    where: { id: userId, families: { some: { users: { some: { id: targetUserId } } } } },
    select: { id: true },
  });

  if (!shared) {
    throw new ForbiddenException('Not authorized for this user');
  }
}
