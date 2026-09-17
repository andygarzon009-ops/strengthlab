import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// The few newest unread notifications, for the client-side announcer.
//
// Same shape of job as the unread count next door, and the same rule: signed
// out returns an empty list rather than a 401, so the poller stays quiet on
// auth screens instead of spraying errors.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return Response.json({ items: [] });

  const items = await prisma.notification.findMany({
    where: { userId: session.userId, read: false },
    select: { id: true, type: true, body: true, url: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return Response.json({ items });
}
