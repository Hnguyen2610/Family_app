import { PrismaService } from '../../prisma/prisma.service';
import { getIctNow } from '../../utils/timezone.util';

export function getDedupeSince(dedupeDays: number) {
  const since = getIctNow();
  since.setDate(since.getDate() - dedupeDays);
  return since;
}

export async function hasRecentNotification(
  prisma: PrismaService,
  userId: string,
  type: string,
  title: string,
  dedupeDays: number,
) {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      title,
      createdAt: { gte: getDedupeSince(dedupeDays) },
    },
    select: { id: true },
  });

  return !!existing;
}
