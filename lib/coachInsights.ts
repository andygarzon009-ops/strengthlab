import { e1rm } from "@/lib/strengthProgression";

/// A single lift's coach analysis: one headline takeaway, a few supporting
/// observations, and an optional concrete next target. Computed deterministically
/// from session history — no model call, so it's instant and always available.
export type CoachInsight = {
  headline: string;
  tone: "positive" | "neutral" | "warning";
  points: string[];
  nextTarget: { weight: number; reps: number; label: string } | null;
};

export type InsightSession = {
  at: string; // ISO
  topWeight: number;
  topReps: number;
  topE1rm: number;
  isPR: boolean;
  setE1rms: number[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function relativeDay(d: Date): string {
  const day = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (day <= 0) return "today";
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  if (day < 14) return "last week";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/// Build the coaching takeaway for one lift. `sessions` must be sorted
/// ascending by date. Returns null when there's nothing meaningful to say.
export function buildLiftCoachInsight(
  sessions: InsightSession[],
  exerciseName: string,
): CoachInsight | null {
  if (sessions.length === 0) return null;

  const latest = sessions[sessions.length - 1];
  const current = Math.round(latest.topE1rm);
  const best = Math.round(
    sessions.reduce((m, s) => (s.topE1rm > m ? s.topE1rm : m), 0),
  );
  const prCount = sessions.filter((s) => s.isPR).length;

  // 30-day window for trend + frequency.
  const monthCutoff = Date.now() - 30 * DAY_MS;
  const inWindow = sessions.filter((s) => new Date(s.at).getTime() >= monthCutoff);

  // Trend: latest vs the earliest session in the 30-day window. Fall back to
  // the previous session when the window is too thin to be meaningful.
  let trendDelta: number | null = null;
  let trendBasis = 0; // how many sessions the trend spans
  if (inWindow.length >= 2) {
    trendDelta = latest.topE1rm - inWindow[0].topE1rm;
    trendBasis = inWindow.length;
  } else if (sessions.length >= 2) {
    trendDelta = latest.topE1rm - sessions[sessions.length - 2].topE1rm;
    trendBasis = 2;
  }
  const FLAT_LB = 2;
  const direction: "up" | "down" | "flat" | null =
    trendDelta === null
      ? null
      : trendDelta > FLAT_LB
        ? "up"
        : trendDelta < -FLAT_LB
          ? "down"
          : "flat";

  const gap = best - current;

  // ---- Headline ----
  let headline: string;
  let tone: CoachInsight["tone"];
  if (latest.isPR) {
    headline = `New PR — ${latest.topWeight} × ${latest.topReps} is your best ${exerciseName} yet at ${current} lb.`;
    tone = "positive";
  } else if (gap <= 0) {
    headline = `You're at your peak — ${current} lb matches your all-time best.`;
    tone = "positive";
  } else if (gap <= Math.max(3, best * 0.05)) {
    headline = `Holding near your peak — just ${gap} lb off your best of ${best} lb.`;
    tone = "neutral";
  } else if (direction === "up") {
    headline = `Rebuilding — back up to ${current} lb, ${gap} lb under your best of ${best} lb.`;
    tone = "neutral";
  } else {
    headline = `Off your peak — ${current} lb now vs your best of ${best} lb (${gap} lb down).`;
    tone = "warning";
  }
  if (sessions.length === 1) {
    headline = `First ${exerciseName} session logged at ${current} lb — your starting baseline.`;
    tone = "neutral";
  }

  // ---- Supporting points ----
  const points: string[] = [];

  if (direction === "up" && trendDelta !== null) {
    points.push(
      `Trending up: +${Math.round(trendDelta)} lb across your last ${trendBasis} sessions.`,
    );
  } else if (direction === "down" && trendDelta !== null) {
    points.push(
      `Down ${Math.abs(Math.round(trendDelta))} lb over the last month — likely fatigue or a deload.`,
    );
  } else if (direction === "flat") {
    points.push(`Flat over the last month — time to add load or chase a rep.`);
  }

  // PR recency.
  const lastPr = [...sessions].reverse().find((s) => s.isPR);
  if (lastPr && !latest.isPR) {
    points.push(
      `Last PR ${relativeDay(new Date(lastPr.at))} (${lastPr.topWeight} × ${lastPr.topReps}). ${prCount} total.`,
    );
  } else if (prCount > 1 && latest.isPR) {
    points.push(`${prCount} PRs on this lift — you keep raising the bar.`);
  }

  // Frequency / consistency.
  if (inWindow.length >= 1) {
    const perWeek = (inWindow.length / 30) * 7;
    const freq =
      perWeek >= 1
        ? `~${perWeek.toFixed(1)}×/week`
        : `~${Math.round(perWeek * 4)}×/month`;
    let line = `Trained ${inWindow.length}× in the last 30 days (${freq}).`;
    if (inWindow.length < 3) line += " More frequency would speed gains.";
    points.push(line);
  }

  // ---- Next target: smallest progression that beats the all-time best. ----
  let nextTarget: CoachInsight["nextTarget"] = null;
  if (best > 0) {
    const w = latest.topWeight;
    // Reps needed at the current top weight to edge past the best e1RM.
    let repsToBeat: number | null = null;
    for (let r = 1; r <= 12; r++) {
      if (e1rm(w, r) > best + 0.5) {
        repsToBeat = r;
        break;
      }
    }
    if (repsToBeat !== null && repsToBeat <= latest.topReps + 3) {
      nextTarget = {
        weight: w,
        reps: repsToBeat,
        label: `Next goal: ${w} × ${repsToBeat} sets a new best.`,
      };
    } else {
      // A rep PR is out of reach in a sane range — nudge the load instead.
      const bump = w >= 100 ? 5 : 2.5;
      const nextW = Math.round((w + bump) * 2) / 2;
      nextTarget = {
        weight: nextW,
        reps: Math.max(1, latest.topReps),
        label: `Next goal: ${nextW} × ${Math.max(1, latest.topReps)} to push past ${best} lb.`,
      };
    }
  }

  return { headline, tone, points, nextTarget };
}
