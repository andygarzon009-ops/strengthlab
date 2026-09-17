import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// How many devices the server believes it can reach for this user. The client
// can see its own subscription, but not whether the POST that was supposed to
// persist it ever landed — and that gap is exactly where every subscription
// was being lost.

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getSession();
  if (!session?.userId) return Response.json({ devices: 0 });

  const devices = await prisma.pushSubscription.count({
    where: { userId: session.userId },
  });
  return Response.json({ devices, configured: !!process.env.VAPID_PRIVATE_KEY });
}
