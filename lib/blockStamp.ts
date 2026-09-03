/// Server-side resolution of "where is this athlete in their cycle right now".
///
/// lib/periodization.ts is pure arithmetic; this is the part that has to talk
/// to the database, because the answer now depends on which weeks the athlete
/// actually trained. It's shared by the coach (which programs off the state)
/// and by workout logging (which freezes it onto the row), so the two can't
/// drift into disagreeing about what week it is.

import { prisma } from "@/lib/db";
import {
  isValidConfig,
  periodizationState,
  trainedWeekSet,
  type PeriodizationConfig,
  type PeriodizationState,
} from "@/lib/periodization";

/// Look back far enough to cover any realistic cycle without reading a user's
/// whole history. A cycle running longer than this is already past the point
/// where "week N" means anything.
const LOOKBACK_DAYS = 540;

/// A Date rendered as the athlete's local calendar day. Workout rows store an
/// instant; week boundaries are local, so the conversion has to happen here and
/// not with `toISOString()`, which would file a Sunday-evening session in
/// Vancouver as Monday.
export function localDateKey(d: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type ResolvedBlock = {
  config: PeriodizationConfig;
  state: PeriodizationState;
};

/// The athlete's cycle state on `onDate` (local YYYY-MM-DD), gated by the weeks
/// they actually logged something in. Null when no valid cycle is configured or
/// the cycle hasn't started yet.
///
/// `user` is accepted pre-fetched because both callers already have the row —
/// re-reading it here would be a second query for no reason.
export async function resolveBlock(
  userId: string,
  onDate: string,
  opts: { periodization?: unknown; timezone?: string | null },
): Promise<ResolvedBlock | null> {
  const config = opts.periodization as PeriodizationConfig | null;
  if (!isValidConfig(config)) return null;

  const tz = opts.timezone || "UTC";
  const floor = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000);
  // Start of the cycle, whichever is later — no point reading sessions from
  // before week 1.
  const cycleStart = new Date(`${config.startDate}T00:00:00Z`);
  const since = cycleStart > floor ? cycleStart : floor;

  const rows = await prisma.workout.findMany({
    where: { userId, date: { gte: since } },
    select: { date: true },
    orderBy: { date: "asc" },
  });

  const trained = trainedWeekSet(
    config.startDate,
    rows.map((r) => localDateKey(r.date, tz)),
  );
  const state = periodizationState(config, onDate, trained);
  return state ? { config, state } : null;
}

/// The columns a workout row carries. Deload weeks pause the block rather than
/// belonging to one, so they stamp the block name as "Deload" with no week
/// position — matching what `periodizationState` reports.
export function blockStampColumns(state: PeriodizationState | null) {
  if (!state) {
    return {
      blockName: null,
      blockWeek: null,
      blockWeeks: null,
      blockCycleWeek: null,
    };
  }
  return {
    blockName: state.blockName,
    blockWeek: state.isDeloadWeek ? null : state.weekInBlock,
    blockWeeks: state.isDeloadWeek ? null : state.blockWeeks,
    blockCycleWeek: state.weekNumber,
  };
}
