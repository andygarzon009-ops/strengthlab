"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { FIGURES } from "@/lib/bodyPaths";
import {
  CHECK_IN_INTERVAL_DAYS,
  CHECK_IN_KEYS,
  bestValues,
  checkInStreak,
  interpret,
  latestValues,
  measurementLabel,
  moveStatus,
  verdictWord,
  wantFor,
  type CheckIn,
  type MeasurementKey,
  type MoveStatus,
  type Snapshot,
} from "@/lib/bodyMeasurements";
import { tapeSpots } from "@/lib/bodyMapGeometry";
import {
  STATUS_COLOR,
  STATUS_TEXT,
  fmtDelta,
  fmtValue,
  fromShown,
  shownUnit,
  stepFor,
  stepLabel,
} from "@/lib/measureDisplay";
import { saveCheckIn } from "@/lib/actions/measurements";
import { useMeasureUnit } from "@/components/useMeasureUnit";

const MIRROR = "translate(100,0) scale(-1,1)";

function hintFor(key: MeasurementKey, sex: string | null): string {
  switch (key) {
    case "bodyweight":
      return "Morning, after the bathroom, before food.";
    case "waist":
      return "At the belly button. Breathe out, don’t suck in.";
    case "chest":
      return sex === "FEMALE"
        ? "Around the fullest part, arms down, tape level."
        : "Across the nipples, arms down, tape level.";
    case "shoulders":
      return "Around the widest point of the delts, arms relaxed.";
    case "arm":
      return "Flexed, at the peak of the bicep.";
    case "forearm":
      return "Thickest part, fist clenched.";
    case "hips":
      return "Fullest part of the seat, feet together, tape level.";
    case "thigh":
      return "Just below the glute fold, standing tall.";
    case "calf":
      return "Widest point, standing flat-footed.";
    case "bodyFat":
      return "From your smart scale — or skip it.";
    default:
      return "";
  }
}

function praiseFor(key: MeasurementKey, want: 1 | -1 | 0): string {
  switch (key) {
    case "bodyweight":
      return want > 0
        ? "The scale’s climbing — the surplus is working."
        : "The scale’s coming down — the cut is working.";
    case "waist":
      return "Tighter waist — that’s coming off your middle.";
    case "chest":
      return "Chest is growing.";
    case "shoulders":
      return "Wider shoulders — the taper’s coming in.";
    case "arm":
      return "Arms are growing.";
    case "forearm":
      return "Forearms filling out.";
    case "hips":
      return "Glutes are growing.";
    case "thigh":
      return "Legs are growing.";
    case "calf":
      return "Calves up — the stubborn ones.";
    case "bodyFat":
      return "Leaner than last time.";
    default:
      return "Moving your way.";
  }
}

// Where the − / + buttons start for someone measuring a spot for the first
// time: a typical trained adult, so a few taps reach most people.
const TYPICAL: Record<"male" | "female", Partial<Record<MeasurementKey, number>>> = {
  male: { bodyweight: 180, waist: 34, chest: 41, shoulders: 47, arm: 14, forearm: 12, hips: 38, thigh: 23, calf: 15, bodyFat: 18 },
  female: { bodyweight: 145, waist: 29, chest: 36, shoulders: 41, arm: 11.5, forearm: 9.5, hips: 39, thigh: 22, calf: 14, bodyFat: 26 },
};

const shortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

export default function BodyCheckIn({
  sex,
  phase,
  history,
}: {
  sex: string | null;
  phase: string | null;
  history: CheckIn[];
}) {
  const router = useRouter();
  const lengths = useMeasureUnit();
  const [step, setStep] = useState(-1);
  const [vals, setVals] = useState<Partial<Record<MeasurementKey, number>>>({});
  const [skipped, setSkipped] = useState<Partial<Record<MeasurementKey, true>>>({});
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const [savedAt, setSavedAt] = useState(0);

  const last = useMemo(() => latestValues(history), [history]);
  const best = useMemo(() => bestValues(history, phase, sex), [history, phase, sex]);
  const figure = FIGURES[sex === "FEMALE" ? "female" : "male"];
  const geometry = tapeSpots(sex);
  const N = CHECK_IN_KEYS.length;
  const done = step >= N;

  const prevOf = (key: MeasurementKey) =>
    typeof last[key] === "number" ? (last[key] as number) : null;
  const statusOf = (key: MeasurementKey): MoveStatus | null => {
    const v = vals[key];
    const p = prevOf(key);
    if (v === undefined || p === null) return null;
    return moveStatus(key, v - p, wantFor(key, phase, sex));
  };

  // Every spot starts on last time's number, so most of a check-in is a tap
  // or two of − / +. A first-timer starts on a typical value instead.
  const go = (to: number) => {
    setError(null);
    setDraft(null);
    if (to >= 0 && to < N) {
      const key = CHECK_IN_KEYS[to];
      if (vals[key] === undefined) {
        const start = prevOf(key);
        if (start !== null) setVals((v) => ({ ...v, [key]: start }));
      }
    }
    setStep(to);
  };

  // `skipping` covers the spot skipped on the way out, whose state update
  // hasn't landed yet when this runs.
  const finish = (skipping?: MeasurementKey) => {
    const measured: Partial<Record<MeasurementKey, number>> = {};
    for (const key of CHECK_IN_KEYS) {
      if (key === skipping || skipped[key]) continue;
      if (vals[key] !== undefined) measured[key] = vals[key];
    }
    startSaving(async () => {
      const res = await saveCheckIn(measured);
      if (res.ok) {
        setSavedAt(Date.now());
        setStep(N);
      }
      else setError(res.error);
    });
  };

  // ── Start ───────────────────────────────────────────────────────────────
  if (step === -1) {
    return (
      <div className="flex flex-col gap-5 pt-6" style={{ minHeight: "70vh" }}>
        <p className="text-[12px] uppercase tracking-[0.12em]" style={{ color: STATUS_TEXT.good }}>
          Monthly tape
        </p>
        <h1 className="text-[34px] leading-[1.05] font-bold tracking-tight">
          {history.length
            ? "Let’s see what a month of training built."
            : "Let’s set your starting point."}
        </h1>
        <p className="text-[15px] leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          {N} spots, about 2 minutes.{" "}
          {history.length
            ? "Each one starts at last time’s number — just nudge it."
            : "We’ll show you exactly where to put the tape."}
        </p>
        <div className="space-y-2.5">
          {["Morning, before food", "Tape snug, not squeezing", "Same spots every month"].map(
            (t, i) => (
              <div key={t} className="flex items-center gap-3 text-[14px]">
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
                >
                  {i + 1}
                </span>
                {t}
              </div>
            ),
          )}
        </div>
        <button
          type="button"
          onClick={() => go(0)}
          className="btn-accent rounded-2xl h-14 text-[17px] mt-auto"
        >
          Start
        </button>
      </div>
    );
  }

  // ── Reward ──────────────────────────────────────────────────────────────
  if (done) {
    const measured = CHECK_IN_KEYS.filter((k) => !skipped[k] && vals[k] !== undefined);
    const compared = measured.filter((k) => prevOf(k) !== null);
    const wins = compared.filter((k) => statusOf(k) === "good").length;
    const next: Snapshot = { ...last };
    for (const k of measured) next[k] = vals[k];
    const word = history.length ? verdictWord(last, next) : null;
    const reading = history.length ? interpret(last, next) : null;
    const pbs = measured.filter((k) => {
      const b = best[k];
      const want = wantFor(k, phase, sex);
      return b !== undefined && (want > 0 ? vals[k]! > b : vals[k]! < b);
    });
    const streak = checkInStreak([
      ...history,
      { takenAt: new Date(savedAt).toISOString(), values: {} },
    ]);
    const nextAt = new Date(savedAt + CHECK_IN_INTERVAL_DAYS * 86_400_000);
    const C = 2 * Math.PI * 70;
    const frac = compared.length ? wins / compared.length : 0;

    return (
      <div className="flex flex-col gap-4 pt-4">
        {compared.length > 0 ? (
          <div className="flex items-center gap-4 sl-rise">
            <svg width="112" height="112" viewBox="0 0 160 160" role="img" aria-label={`${wins} of ${compared.length} moved your way`}>
              <circle cx="80" cy="80" r="70" fill="none" stroke="#1c1c1f" strokeWidth="12" />
              <circle
                cx="80"
                cy="80"
                r="70"
                fill="none"
                stroke={STATUS_COLOR.good}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={C * (1 - frac)}
                transform="rotate(-90 80 80)"
                className="sl-ring"
                style={{ ["--sl-ring" as string]: C }}
              />
              <text x="80" y="88" textAnchor="middle" fill="var(--fg)" fontSize="44" fontWeight="600" className="font-mono">
                {wins}
              </text>
              <text x="80" y="112" textAnchor="middle" fill="var(--fg-muted)" fontSize="13">
                of {compared.length} wins
              </text>
            </svg>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--fg-muted)" }}>
                This month
              </p>
              <p
                className="text-[30px] leading-none font-bold tracking-tight mt-1"
                style={{ color: wins > 0 ? STATUS_TEXT.good : "var(--fg)" }}
              >
                {word ?? "Logged"}
              </p>
            </div>
          </div>
        ) : (
          <div className="sl-rise space-y-1">
            <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "var(--fg-muted)" }}>
              Starting point
            </p>
            <p className="text-[32px] leading-none font-bold tracking-tight" style={{ color: STATUS_TEXT.good }}>
              Baseline set
            </p>
          </div>
        )}
        <p className="text-[15px] leading-relaxed sl-rise" style={{ color: "var(--fg-muted)", animationDelay: "250ms" }}>
          {reading ??
            (compared.length
              ? "Every check-in sharpens the picture."
              : "Next month you’ll see exactly what your training changed.")}
        </p>

        {pbs.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] uppercase tracking-[0.1em]" style={{ color: "#fbbf24" }}>
              New personal bests
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              {pbs.map((k, i) => (
                <div
                  key={k}
                  className="flex items-center gap-2 px-2.5 py-2 rounded-xl sl-pop"
                  style={{
                    background: "rgba(251,191,36,0.08)",
                    border: "1px solid rgba(251,191,36,0.22)",
                    animationDelay: `${500 + i * 120}ms`,
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
                    <path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4ZM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-[11px]" style={{ color: "var(--fg-muted)" }}>
                      {wantFor(k, phase, sex) > 0 ? "Biggest" : "Lowest"}{" "}
                      {measurementLabel(k, sex).toLowerCase()}
                    </p>
                    <p className="font-mono text-[14px] font-semibold" style={{ color: "#fbbf24" }}>
                      {fmtValue(k, vals[k]!, lengths)} {shownUnit(k, lengths)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {compared.length > 0 && (
          <div className="grid grid-cols-3 gap-1.5">
            {compared.map((k, i) => {
              const s = statusOf(k)!;
              return (
                <div
                  key={k}
                  className="card px-2.5 py-2 sl-pop"
                  style={{ borderRadius: 12, animationDelay: `${700 + pbs.length * 120 + i * 50}ms` }}
                >
                  <p className="text-[10px] uppercase tracking-[0.06em]" style={{ color: "var(--fg-muted)" }}>
                    {measurementLabel(k, sex)}
                  </p>
                  <p className="font-mono text-[14px] font-semibold" style={{ color: STATUS_TEXT[s] }}>
                    {fmtDelta(k, vals[k]! - prevOf(k)!, lengths)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <div className="card px-3.5 py-3 flex items-center justify-between text-[13px] mt-2">
          <span>
            <b>{streak}</b>{" "}
            <span style={{ color: "var(--fg-muted)" }}>{streak === 1 ? "check-in" : "months in a row"}</span>
          </span>
          <span style={{ color: "var(--fg-muted)" }}>Next tape {shortDate(nextAt)}</span>
        </div>
        <button
          type="button"
          onClick={() => router.push("/body")}
          className="btn-accent rounded-2xl h-14 text-[17px]"
        >
          See my body map
        </button>
      </div>
    );
  }

  // ── One spot ────────────────────────────────────────────────────────────
  const key = CHECK_IN_KEYS[step];
  const want = wantFor(key, phase, sex);
  const prev = prevOf(key);
  const value = vals[key];
  const spot = geometry.find((g) => g.key === key);
  const status = statusOf(key);
  const typical = TYPICAL[sex === "FEMALE" ? "female" : "male"][key] ?? 0;

  const nudge = (sign: 1 | -1) => {
    const base = value ?? typical;
    setDraft(null);
    setVals((v) => ({ ...v, [key]: Math.round((base + sign * stepFor(key, lengths)) * 1000) / 1000 }));
  };
  const typed = (text: string) => {
    setDraft(text);
    const n = Number(text.replace(",", "."));
    setVals((v) => {
      const copy = { ...v };
      if (text.trim() === "" || !Number.isFinite(n) || n <= 0) delete copy[key];
      else copy[key] = fromShown(key, n, lengths);
      return copy;
    });
  };

  let feedback: { text: string; bg: string; fg: string; delta: string } | null = null;
  if (value !== undefined && prev !== null) {
    const delta = fmtDelta(key, value - prev, lengths);
    if (want === 0) {
      feedback = { delta, text: "Logged — tracked for context.", bg: "var(--bg-elevated)", fg: STATUS_TEXT.held };
    } else if (status === "good") {
      feedback = { delta, text: praiseFor(key, want), bg: "rgba(34,197,94,0.14)", fg: STATUS_TEXT.good };
    } else if (status === "bad") {
      feedback = { delta, text: "Small dip — often just tape placement. One month is noise.", bg: "rgba(245,158,11,0.14)", fg: STATUS_TEXT.bad };
    } else {
      feedback = { delta, text: "Holding steady — inside normal tape wobble.", bg: "var(--bg-elevated)", fg: STATUS_TEXT.held };
    }
  }

  const isLast = step === N - 1;
  const advance = () => {
    setSkipped((s) => {
      const copy = { ...s };
      delete copy[key];
      return copy;
    });
    if (isLast) finish();
    else go(step + 1);
  };
  const skip = () => {
    setSkipped((s) => ({ ...s, [key]: true }));
    if (isLast) finish(key);
    else go(step + 1);
  };

  const shownValue =
    draft ?? (value !== undefined ? fmtValue(key, value, lengths) : "");

  return (
    <div className="flex flex-col gap-3.5 pt-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => go(step - 1)}
          aria-label="Back"
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1 flex gap-1" aria-hidden="true">
          {CHECK_IN_KEYS.map((k, i) => {
            const s = statusOf(k);
            const c =
              i === step
                ? "var(--fg)"
                : i > step
                  ? "#1f1f22"
                  : skipped[k]
                    ? "#27272a"
                    : s
                      ? s === "held"
                        ? "#52525b"
                        : STATUS_COLOR[s]
                      : "#52525b";
            return <div key={k} className="flex-1 h-1.5 rounded-full" style={{ background: c }} />;
          })}
        </div>
        <span className="font-mono text-[12px] w-9 text-right" style={{ color: "var(--fg-muted)" }}>
          {step + 1}/{N}
        </span>
      </div>

      <div className="flex justify-center" style={{ height: 210 }}>
        <svg width="105" height="210" viewBox="0 0 100 200" aria-hidden="true">
          {[undefined, MIRROR].map((t, i) => (
            <path
              key={i}
              d={figure.silhouette}
              transform={t}
              fill="#18181b"
              stroke={spot ? "#2e2e33" : "var(--accent)"}
              strokeWidth={spot ? 0.7 : 1}
            />
          ))}
          {spot && (
            <line
              x1={spot.x1}
              x2={spot.x2}
              y1={spot.y}
              y2={spot.y}
              stroke="#4ade80"
              strokeWidth={3}
              strokeDasharray="2 1.5"
              strokeLinecap="round"
              className="sl-glow"
            />
          )}
        </svg>
      </div>

      <div className="text-center space-y-1">
        <h1 className="text-[28px] font-bold tracking-tight">{measurementLabel(key, sex)}</h1>
        <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
          {hintFor(key, sex)}
        </p>
      </div>

      <div className="flex flex-col items-center">
        <label className="flex items-baseline justify-center gap-1.5">
          <span className="sr-only">{measurementLabel(key, sex)} in {shownUnit(key, lengths)}</span>
          <input
            inputMode="decimal"
            value={shownValue}
            onChange={(e) => typed(e.target.value)}
            onBlur={() => setDraft(null)}
            placeholder={fmtValue(key, typical, lengths)}
            className="bg-transparent text-center font-mono font-semibold tracking-tight outline-none tabular-nums"
            style={{ fontSize: 64, lineHeight: 1, width: `${Math.max(3, shownValue.length || 4) + 0.5}ch`, color: "var(--fg)" }}
          />
          <span className="text-[18px]" style={{ color: "var(--fg-dim)" }}>
            {shownUnit(key, lengths)}
          </span>
        </label>
        <span className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
          {prev !== null
            ? `last time ${fmtValue(key, prev, lengths)} ${shownUnit(key, lengths)}`
            : "first time — tap the number to type it"}
        </span>
      </div>

      <div className="flex justify-center" style={{ minHeight: 50 }} aria-live="polite">
        {feedback && (
          <div
            className="flex items-center gap-2.5 px-3.5 py-2 rounded-2xl max-w-[340px]"
            style={{ background: feedback.bg }}
          >
            <span className="font-mono text-[15px] font-semibold whitespace-nowrap" style={{ color: feedback.fg }}>
              {feedback.delta}
            </span>
            <span className="text-[13px] leading-snug">{feedback.text}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {([-1, 1] as const).map((sign) => (
          <button
            key={sign}
            type="button"
            onClick={() => nudge(sign)}
            aria-label={`${sign < 0 ? "Decrease" : "Increase"} by ${stepLabel(key, lengths)}`}
            className="h-16 rounded-2xl text-[26px] active:scale-95 transition-transform"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-strong)" }}
          >
            {sign < 0 ? "−" : "+"}{" "}
            <span className="text-[14px]" style={{ color: "var(--fg-dim)" }}>
              {stepLabel(key, lengths)}
            </span>
          </button>
        ))}
      </div>
      {error && (
        <p className="text-[13px] text-center" style={{ color: STATUS_TEXT.bad }}>
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={advance}
        disabled={value === undefined || saving}
        className="btn-accent rounded-2xl h-14 text-[17px]"
      >
        {saving
          ? "Saving…"
          : isLast
            ? "See my results"
            : `Next · ${measurementLabel(CHECK_IN_KEYS[step + 1], sex)}`}
      </button>
      <button
        type="button"
        onClick={skip}
        disabled={saving}
        className="h-9 text-[13px]"
        style={{ color: "var(--fg-dim)" }}
      >
        Skip this one
      </button>
      {step === 0 && (
        <Link href="/body" className="text-center text-[12px]" style={{ color: "var(--fg-dim)" }}>
          Cancel
        </Link>
      )}
    </div>
  );
}
