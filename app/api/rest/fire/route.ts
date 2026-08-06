import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";

/// QStash calls this at the moment a rest period ends. Everything here runs
/// server-side, so it works with the phone locked and the app closed.

export const dynamic = "force-dynamic";

/**
 * How far the queued end time may drift from the stored one and still count
 * as the same rest. Covers ordinary delivery jitter without letting a
 * superseded rest through.
 */
const MATCH_TOLERANCE_MS = 5000;

export async function POST(req: Request) {
  // The secret is forwarded by our own publish call (Upstash-Forward-*), so a
  // request carrying it came from a schedule we created. Without the secret
  // configured this stays shut rather than defaulting open — it sends push
  // notifications, so an anonymous caller must not be able to drive it.
  const secret = process.env.REST_PUSH_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "not configured" }, { status: 503 });
  }
  if (req.headers.get("x-rest-secret") !== secret) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  let userId = "";
  let endsAt = "";
  try {
    const body = await req.json();
    userId = String(body?.userId ?? "");
    endsAt = String(body?.endsAt ?? "");
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!userId || !endsAt) {
    return Response.json({ error: "bad body" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { restEndsAt: true },
  });

  // No rest running — it was skipped, or the timer was cancelled.
  if (!user?.restEndsAt) {
    return Response.json({ ok: true, sent: false, reason: "no-active-rest" });
  }

  // A different rest is running now. This happens whenever another set is
  // logged mid-rest: the newer schedule moved restEndsAt, and this older
  // message would otherwise announce "rest done" partway through it.
  const drift = Math.abs(
    user.restEndsAt.getTime() - new Date(endsAt).getTime()
  );
  if (drift > MATCH_TOLERANCE_MS) {
    return Response.json({ ok: true, sent: false, reason: "superseded" });
  }

  await sendPushToUser(userId, {
    title: "Rest done",
    body: "Next set's up.",
    url: "/log",
    // Matches the tag the page-side notification uses, so a locked-screen
    // push and an in-page one can never stack into two banners.
    tag: "rest-end",
  });

  // Consume it, so a duplicate delivery can't notify twice.
  await prisma.user.update({
    where: { id: userId },
    data: { restEndsAt: null },
  });

  return Response.json({ ok: true, sent: true });
}
