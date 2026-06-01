import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// Lightweight unread count for the notifications bell. Returns 0 (not 401)
// when signed out so the client poller stays quiet on auth screens.
export async function GET() {
  const session = await getSession();
  if (!session?.userId) return Response.json({ count: 0 });

  const [pendingRequests, unreadActivity] = await Promise.all([
    prisma.friendRequest.count({
      where: { toUserId: session.userId, status: "PENDING" },
    }),
    prisma.notification.count({
      where: { userId: session.userId, read: false },
    }),
  ]);

  return Response.json({ count: pendingRequests + unreadActivity });
}
