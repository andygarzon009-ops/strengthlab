/// Deciding when someone has been away longer than is normal *for them*.
///
/// The obvious version of this feature — "nudge at 3 days" — is worse than no
/// feature. Three days off is a deload, a rest phase, an injury, or simply how
/// someone who trains twice a week always looks. Telling those people they've
/// lapsed is telling them off for following their own programme, and the cost
/// isn't just a bad notification: people don't mute one category, they mute
/// the app, and the friend-request and crew pings go with it.
///
/// So the bar is each athlete's own cadence. Median gap between their recent
/// sessions, and a nudge only once the current gap is meaningfully past it.

/** How far back to look when working out someone's rhythm. */
const WINDOW_DAYS = 56;

/**
 * Fewest sessions in the window before we'll claim to know someone's cadence.
 * Three workouts give two gaps, and a median of two numbers is just their
 * average — too thin to act on. Four gives three gaps and a real middle value.
 */
const MIN_WORKOUTS = 4;

/** Days past the personal median before a nudge is warranted. */
const SLACK_DAYS = 2;

/** Never nudge earlier than this, however often someone normally trains. */
const MIN_THRESHOLD_DAYS = 4;

/**
 * Never wait longer than this. Someone who trains fortnightly still gets a
 * nudge eventually, rather than the threshold drifting out with their gap.
 */
const MAX_THRESHOLD_DAYS = 10;

/** One nudge per user per week, at most. */
export const NUDGE_COOLDOWN_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between two instants, floored. */
export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export type NudgeWorkout = {
  date: Date;
  title: string;
  isDeload: boolean;
};

export type NudgeDecision =
  | { nudge: false; reason: string }
  | {
      nudge: true;
      /** Days since the last session. */
      gapDays: number;
      /** Their usual gap, rounded for display. */
      medianGapDays: number;
      lastTitle: string;
      lastDate: Date;
    };

/**
 * Decide whether an athlete is overdue by their own standard.
 *
 * `workouts` must be that user's sessions inside the lookback window, newest
 * first. `now` is injected so this is testable and so the caller controls the
 * clock.
 */
export function decideNudge(
  workouts: NudgeWorkout[],
  now: Date,
  opts: { lastNudgedAt?: Date | null } = {}
): NudgeDecision {
  const { lastNudgedAt } = opts;

  // Rate limit first — it's the cheapest check and the most important. NULL
  // means never nudged, which is eligible, not "just nudged".
  if (lastNudgedAt && daysBetween(lastNudgedAt, now) < NUDGE_COOLDOWN_DAYS) {
    return { nudge: false, reason: "cooldown" };
  }

  const recent = workouts
    .filter((w) => daysBetween(w.date, now) <= WINDOW_DAYS)
    .sort((a, b) => b.date.getTime() - a.date.getTime());

  // Someone with no history isn't lapsed, they're new. That's an onboarding
  // problem and it deserves different words, not this notification.
  if (recent.length < MIN_WORKOUTS) {
    return { nudge: false, reason: "not-enough-history" };
  }

  const last = recent[0];

  // A deload is planned rest. Nudging through one is the single most annoying
  // thing this feature could do, because the athlete is doing it right.
  if (last.isDeload) {
    return { nudge: false, reason: "deload" };
  }

  const gaps: number[] = [];
  for (let i = 0; i < recent.length - 1; i++) {
    const gap = daysBetween(recent[i + 1].date, recent[i].date);
    // Two sessions the same day (a double, or a fixed-up log) aren't a gap.
    if (gap > 0) gaps.push(gap);
  }
  if (gaps.length === 0) {
    return { nudge: false, reason: "no-usable-gaps" };
  }

  const usual = median(gaps);
  const threshold = Math.min(
    MAX_THRESHOLD_DAYS,
    Math.max(MIN_THRESHOLD_DAYS, Math.round(usual + SLACK_DAYS))
  );
  const gapDays = daysBetween(last.date, now);

  if (gapDays < threshold) {
    return { nudge: false, reason: "within-cadence" };
  }

  return {
    nudge: true,
    gapDays,
    medianGapDays: Math.round(usual),
    lastTitle: last.title,
    lastDate: last.date,
  };
}

/**
 * The words. Deliberately all facts and no adjectives — their numbers read
 * back to them. Nothing here says "should", and nothing congratulates or
 * scolds, because the same message goes to someone taking a deserved break
 * and someone who has genuinely drifted, and it has to be fair to both.
 */
export function nudgeCopy(
  decision: Extract<NudgeDecision, { nudge: true }>,
  timezone?: string | null
): { title: string; body: string; url: string; tag: string } {
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: timezone || "UTC",
  }).format(decision.lastDate);

  const usual =
    decision.medianGapDays === 1
      ? "every day"
      : `every ${decision.medianGapDays} days`;

  return {
    title: `${decision.gapDays} days since your last session`,
    body: `${decision.lastTitle} on ${weekday}. You normally train ${usual}.`,
    url: "/log",
    // One tag so a nudge replaces any previous one rather than stacking.
    tag: "inactivity-nudge",
  };
}

/**
 * The local hour for a user, used to hold the nudge until morning. Falls back
 * to UTC when a timezone was never captured.
 */
export function localHour(now: Date, timezone?: string | null): number {
  try {
    const hour = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: timezone || "UTC",
    }).format(now);
    const parsed = parseInt(hour, 10);
    return Number.isFinite(parsed) ? parsed % 24 : 8;
  } catch {
    // Unknown/garbage IANA name — treat as sendable rather than stranding
    // the user in a state where they can never be notified.
    return 8;
  }
}
