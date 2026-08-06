import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { publishDelayed, qstashConfigured } from "@/lib/qstash";

/// Called when a rest period starts. Records when it ends and queues a
/// server-side callback for that moment, so the notification survives the
/// screen locking — which is the one case the page-side timer can't cover.

export const dynamic = "force-dynamic";

/** Guard rails on the requested duration, matching the rest pill's options. */
const MIN_SECONDS = 5;
const MAX_SECONDS = 600;

export async function POST(req: Request) {
  const userId = await requireAuth();

  let seconds = 0;
  try {
    const body = await req.json();
    seconds = Math.round(Number(body?.seconds));
  } catch {
    return Response.json({ error: "bad body" }, { status: 400 });
  }
  if (!Number.isFinite(seconds) || seconds < MIN_SECONDS) {
    return Response.json({ error: "bad seconds" }, { status: 400 });
  }
  seconds = Math.min(MAX_SECONDS, seconds);

  const endsAt = new Date(Date.now() + seconds * 1000);

  // Written before publishing, and always — even when QStash isn't set up.
  // The callback compares against this to tell a live rest from a superseded
  // one, so it has to be the single source of truth for "the rest currently
  // running", not a side effect of scheduling succeeding.
  await prisma.user.update({
    where: { id: userId },
    data: { restEndsAt: endsAt },
  });

  if (!qstashConfigured()) {
    // Nothing queued, but the in-app cue still fires. Reported so this is
    // diagnosable rather than silently doing nothing.
    return Response.json({ ok: true, scheduled: false, reason: "not-configured" });
  }

  const scheduled = await publishDelayed(
    "/api/rest/fire",
    { userId, endsAt: endsAt.toISOString() },
    seconds
  );

  return Response.json({ ok: true, scheduled, endsAt: endsAt.toISOString() });
}

/// Rest was skipped or the timer cancelled. Clearing restEndsAt is enough to
/// defuse the queued callback — it fires, finds no matching rest, and stops.
export async function DELETE() {
  const userId = await requireAuth();
  await prisma.user.update({
    where: { id: userId },
    data: { restEndsAt: null },
  });
  return Response.json({ ok: true });
}
