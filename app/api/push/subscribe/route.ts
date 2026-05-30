import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

type Body = {
  endpoint?: string;
  keys?: { p256dh?: string; auth?: string };
};

/// Stores (or refreshes) a Web Push subscription for the signed-in user.
/// Keyed by endpoint so re-subscribing the same device just updates the keys.
export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;
  const { endpoint, keys } = body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return Response.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: session.userId,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
    // Endpoint can move between accounts on a shared device — keep it pointed
    // at whoever is currently signed in.
    update: { userId: session.userId, p256dh: keys.p256dh, auth: keys.auth },
  });

  return Response.json({ ok: true });
}
