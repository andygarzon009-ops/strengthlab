"use client";

import { useState } from "react";

type Severity = "high" | "medium" | "low";

export type WeakSpotKind =
  | "missed-muscles"
  | "plateau"
  | "rep-stall"
  | "freq-gap"
  | "volume-drop"
  | "overtraining";

export type WeakSpot = {
  id: string;
  kind: WeakSpotKind;
  severity: Severity;
  title: string;
  detail: string;
  // Optional subject (lift or muscle name) so the advice card can
  // reference it in its copy without re-parsing the title.
  subject?: string;
};

type Advice = {
  why: string;
  tryThis: string[];
};

function adviceFor(kind: WeakSpotKind, subject?: string): Advice {
  const lift = subject ?? "this lift";
  switch (kind) {
    case "missed-muscles":
      return {
        why: "Muscles you skip for a full week lose stimulus and start lagging. Rear delts, calves, and hamstrings are the usual offenders — they're rarely a primary mover, so they get crowded out unless you program them deliberately.",
        tryThis: [
          "Add 2–3 sets of a direct movement for each missed muscle to your next session — Y-raises for rear delts, calf raises, leg curls.",
          "Swap one compound finisher for an isolation hit on the missed area (e.g. cable rear-delt fly instead of another set of rows).",
          "If it keeps showing up, build the missed muscle into your split as its own slot rather than relying on incidental work.",
        ],
      };
    case "plateau":
      return {
        why: `${lift} hasn't moved up in load for 3 sessions. Plateaus are normal but they're also a signal — neural adaptation has caught up to the current stimulus and you need to change a variable to keep progressing.`,
        tryThis: [
          "Add 1–2 reps at the current weight before you try to add load — most plateaus break by accumulating reps first.",
          "Drop the weight 10% and run a 2-week rep-range cycle (sets of 8–10) to rebuild work capacity.",
          "Audit recovery: under 7h sleep or under-eating will mask itself as a strength plateau.",
          "Swap to a close cousin for a block (front squat for back squat, incline for flat) — the new pattern often unlocks the original.",
        ],
      };
    case "rep-stall":
      return {
        why: `${lift} is bodyweight, so progress = adding reps. Three sessions stuck at the same rep count means you're at the edge of your current capacity for that movement.`,
        tryThis: [
          "Push the top set 1 rep past failure with a brief pause-and-go — even one extra rep restarts progression.",
          "Slow the eccentric (3–4 seconds down) on every rep. Time-under-tension breaks rep stalls without changing the count.",
          "Add load: a weight vest, dip belt, or holding a dumbbell makes the next session 1 rep harder and resets the count.",
          "Add a set. Three working sets of N is a different stimulus than two sets of N+1.",
        ],
      };
    case "freq-gap":
      return {
        why: "You're on pace to finish the week under your own session target. One light week is fine; a pattern of light weeks is how training stalls — frequency drives the bulk of progress for most lifters.",
        tryThis: [
          "Squeeze in a short session — even 30 minutes covering 2–3 compounds counts toward the week.",
          "If life is genuinely too busy, lower your weekly target in your profile so the ring reflects reality.",
          "Front-load next week: schedule the missed sessions before anything else lands on the calendar.",
        ],
      };
    case "volume-drop":
      return {
        why: "Total tonnage this week is well below your 4-week average. Either you trained less, lifted lighter, or cut sets short. Sustained volume drops correlate with strength regression within a few weeks.",
        tryThis: [
          "Check whether you skipped a session vs. just lifted lighter — the fix differs.",
          "If sessions are intact but loads dropped, you may be under-recovering. A deload week is fine; an unplanned one isn't.",
          "Add a top-up set on your main compound of the next 2 sessions to claw back tonnage.",
        ],
      };
    case "overtraining":
      return {
        why: "5+ training days in a row without rest pushes most natural lifters past their recovery curve. Strength gains don't happen during the workout — they happen during the recovery between workouts.",
        tryThis: [
          "Take a full rest day tomorrow. Walk, stretch, eat — that's it.",
          "If you can't take a full day off, swap tomorrow's session for low-intensity mobility or a short walk.",
          "Look at whether the streak is intentional (e.g. a 2-week push) or drift. If it's drift, plan rest days into next week's calendar before they're forced.",
        ],
      };
  }
}

export default function WeakSpots({ spots }: { spots: WeakSpot[] }) {
  if (spots.length === 0) {
    return (
      <div className="mb-4">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="label">Check-up</p>
            <h2 className="text-[18px] font-bold tracking-tight leading-none mt-1">
              Weak spots
            </h2>
          </div>
        </div>
        <div
          className="card p-5 text-center"
          style={{
            background:
              "linear-gradient(180deg, rgba(34,197,94,0.05) 0%, var(--bg-card) 100%)",
            borderColor: "rgba(34,197,94,0.2)",
          }}
        >
          <p
            className="text-[13px] font-semibold"
            style={{ color: "var(--accent)" }}
          >
            All systems firing
          </p>
          <p
            className="text-[11px] mt-1"
            style={{ color: "var(--fg-muted)" }}
          >
            Nothing flagged this week. Keep it moving.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <p className="label">Check-up</p>
          <h2 className="text-[18px] font-bold tracking-tight leading-none mt-1">
            Weak spots
          </h2>
        </div>
        <p
          className="label text-[9px] nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {spots.length} flagged
        </p>
      </div>

      <div className="space-y-2">
        {spots.map((s) => (
          <WeakSpotCard key={s.id} spot={s} />
        ))}
      </div>
    </div>
  );
}

function WeakSpotCard({ spot }: { spot: WeakSpot }) {
  const [open, setOpen] = useState(false);
  const advice = adviceFor(spot.kind, spot.subject);
  const accent =
    spot.severity === "high"
      ? "#f87171"
      : spot.severity === "medium"
        ? "#fbbf24"
        : "var(--fg-dim)";

  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="card p-4 flex gap-3 items-start w-full text-left transition-colors hover:bg-[var(--bg-elevated)]"
    >
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ background: accent }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold text-[14px] tracking-tight truncate">
            {spot.title}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className="label text-[9px]"
              style={{ color: accent }}
            >
              {spot.severity}
            </span>
            <span
              className="text-[10px] transition-transform"
              style={{
                color: "var(--fg-dim)",
                transform: open ? "rotate(90deg)" : "rotate(0deg)",
              }}
            >
              ▶
            </span>
          </div>
        </div>
        <p
          className="text-[12px] mt-1 leading-relaxed"
          style={{ color: "var(--fg-muted)" }}
        >
          {spot.detail}
        </p>

        {open && (
          <div
            className="mt-3 pt-3 border-t space-y-3"
            style={{ borderColor: "var(--border)" }}
          >
            <div>
              <p
                className="label text-[9px] mb-1"
                style={{ color: "var(--fg-dim)" }}
              >
                Why it matters
              </p>
              <p
                className="text-[12px] leading-relaxed"
                style={{ color: "var(--fg-muted)" }}
              >
                {advice.why}
              </p>
            </div>
            <div>
              <p
                className="label text-[9px] mb-1.5"
                style={{ color: "var(--fg-dim)" }}
              >
                Try this
              </p>
              <ul className="space-y-1.5">
                {advice.tryThis.map((tip, i) => (
                  <li
                    key={i}
                    className="text-[12px] leading-relaxed flex gap-2"
                    style={{ color: "var(--fg-muted)" }}
                  >
                    <span style={{ color: accent }}>•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </button>
  );
}
