import { prisma } from "@/lib/db";
import { sendPushToUser } from "@/lib/push";
import {
  decideNudge,
  nudgeCopy,
  localHour,
  type NudgeWorkout,
} from "@/lib/inactivityNudge";

/// Scheduled sweep for athletes who've been away longer than is normal for
/// them. Runs from Vercel Cron; see vercel.json for the schedule.
///
/// Safe to call more often than needed and safe to call twice: eligibility is
/// re-derived from the database every time, and lastNudgedAt gives a one-week
/// floor per user, so a duplicate invocation sends nothing.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Local hours during which a nudge may go out. */
const SEND_HOUR_START = 7;
const SEND_HOUR_END = 9;

/** Lookback for the cadence calculation, matching WINDOW_DAYS in the lib. */
const WINDOW_DAYS = 56;

export async function GET(req: Request) {
  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Without the secret
  // configured this endpoint stays shut rather than defaulting open — it can
  // send push notifications to every user, so an unauthenticated caller
  // shouldn't be able to trigger it.
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return Response.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  // Only users who could actually receive one: opted in, and with at least one
  // live push subscription. Everyone else is skipped before any work is done.
  const candidates = await prisma.user.findMany({
    where: {
      notifyInactivity: true,
      pushSubscriptions: { some: {} },
    },
    select: {
      id: true,
      timezone: true,
      lastNudgedAt: true,
    },
  });

  let sent = 0;
  const skipped: Record<string, number> = {};
  const skip = (reason: string) => {
    skipped[reason] = (skipped[reason] ?? 0) + 1;
  };

  for (const user of candidates) {
    try {
      // Hold until morning where they are. With a daily cron this only fires
      // for the timezone band the schedule lands in; with an hourly one it's
      // correct everywhere. Either way nobody is woken up.
      const hour = localHour(now, user.timezone);
      if (hour < SEND_HOUR_START || hour > SEND_HOUR_END) {
        skip("outside-send-window");
        continue;
      }

      const rows = await prisma.workout.findMany({
        where: { userId: user.id, date: { gte: since } },
        orderBy: { date: "desc" },
        select: { date: true, title: true, isDeload: true },
      });

      const workouts: NudgeWorkout[] = rows.map((w) => ({
        date: w.date,
        title: w.title,
        isDeload: w.isDeload,
      }));

      const decision = decideNudge(workouts, now, {
        lastNudgedAt: user.lastNudgedAt,
      });
      if (!decision.nudge) {
        skip(decision.reason);
        continue;
      }

      await sendPushToUser(user.id, nudgeCopy(decision, user.timezone));

      // Stamp regardless of whether the push actually landed. sendPushToUser
      // swallows delivery failures by design, so we can't tell — and retrying
      // an undeliverable push every hour would be worse than missing one.
      await prisma.user.update({
        where: { id: user.id },
        data: { lastNudgedAt: now },
      });
      sent++;
    } catch {
      // One user's bad data must never stop the sweep.
      skip("error");
    }
  }

  return Response.json({
    ok: true,
    at: now.toISOString(),
    candidates: candidates.length,
    sent,
    skipped,
  });
}
