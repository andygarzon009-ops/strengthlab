"use client";

import { useEffect, useRef, useState } from "react";

// --- Audio cues (mirrors components/Timer.tsx) ---------------------------
// Web Audio beeps for the timed warm-up countdown. The context is created
// lazily and resumed on every access: browsers start it "suspended" and
// auto-suspend it on tab-switch / screen-lock, after which tones are silent
// until a gesture resumes it. ensureAudio() runs from the Start tap so audio
// unlocks reliably.
type AudioBag = { ctx: AudioContext };
let audioBag: AudioBag | null = null;

function ensureAudio(): AudioBag | null {
  if (typeof window === "undefined") return null;
  if (audioBag) {
    if (audioBag.ctx.state === "suspended") void audioBag.ctx.resume();
    return audioBag;
  }
  try {
    type W = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as W).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    if (ctx.state === "suspended") void ctx.resume();
    audioBag = { ctx };
    return audioBag;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, gainPeak = 0.22) {
  const bag = ensureAudio();
  if (!bag) return;
  const { ctx } = bag;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  const dur = durationMs / 1000;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(gainPeak, now + 0.01);
  gain.gain.linearRampToValueAtTime(0, now + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur + 0.05);
}

// 3-2-1 countdown tick before a timed item ends.
const cueCountdown = () => tone(660, 120, 0.18);
// Rising two-note "next item" cue when a timed item completes.
const cueAdvance = () => {
  tone(880, 160);
  setTimeout(() => tone(1175, 240), 160);
};
// Resolved low tone when the whole warm-up finishes.
const cueDone = () => tone(440, 280, 0.2);

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // ignore — unsupported or blocked
    }
  }
};

type Item = {
  kind?: "cardio" | "mobility" | "activation";
  name: string;
  durationSec?: number;
  reps?: number;
  instructions?: string;
};

type Mode = "idle" | "running" | "done";

const KIND_LABEL: Record<NonNullable<Item["kind"]>, string> = {
  cardio: "Cardio",
  mobility: "Mobility",
  activation: "Activation",
};

const KIND_COLOR: Record<NonNullable<Item["kind"]>, string> = {
  cardio: "#f97316",
  mobility: "#22c55e",
  activation: "#60a5fa",
};

function formatTime(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function totalDuration(items: Item[]): number {
  // For display only. Reps items are treated as ~30s of work for a rough estimate.
  return items.reduce((sum, i) => sum + (i.durationSec ?? (i.reps ? 30 : 0)), 0);
}

export function WarmupSummary({ items }: { items: Item[] }) {
  return (
    <div
      className="mb-4 rounded-2xl p-4"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[14px] font-semibold">Warm-up</h2>
        <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
          ~{Math.round(totalDuration(items) / 60)} min · {items.length}{" "}
          item{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => (
          <li
            key={i}
            className="flex items-center justify-between text-[13px]"
          >
            <div className="flex items-center gap-2 min-w-0">
              {it.kind && (
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: KIND_COLOR[it.kind] }}
                />
              )}
              <span className="truncate">{it.name}</span>
            </div>
            <span
              className="text-[11px] tabular-nums shrink-0 ml-2"
              style={{ color: "var(--fg-dim)" }}
            >
              {it.durationSec ? formatTime(it.durationSec) : `${it.reps} reps`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function GuidedWarmup({
  items,
  onStart,
}: {
  items: Item[];
  // Fired the moment the athlete begins (Start or Skip) so the parent can
  // kick off the workout session timer — no separate "Begin workout" step.
  onStart?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("idle");
  const [idx, setIdx] = useState(0);
  // A timed item's countdown only runs once the athlete taps Start — gives
  // them time to set up equipment before the clock moves. Reset to false on
  // every new item so the next one waits too.
  const [counting, setCounting] = useState(false);
  // Wall-clock anchor for the running countdown. Decrementing a counter on a
  // 1s setInterval freezes the moment the app is backgrounded (browsers
  // throttle/pause timers), so the warm-up "paused" when the user switched
  // apps. Instead we pin the end time and derive remaining from real elapsed
  // time — switching away and back keeps the clock honest.
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  // Tracks the last whole-second we beeped so the 3-2-1 countdown fires once
  // per second, not on every 250ms tick.
  const lastBeepRef = useRef<number | null>(null);

  const current = items[idx];
  const fullDur = current?.durationSec ?? 0;
  const remaining =
    counting && endsAt !== null
      ? Math.max(0, Math.ceil((endsAt - now) / 1000))
      : fullDur;

  // Drive the displayed countdown from the wall clock, and re-sync the
  // instant the app returns to the foreground so a background stint doesn't
  // leave a stale number on screen.
  useEffect(() => {
    if (mode !== "running" || !counting || endsAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 250);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        ensureAudio();
        tick();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [mode, counting, endsAt]);

  // Audible 3-2-1 countdown in the final seconds of a timed item.
  useEffect(() => {
    if (mode !== "running" || !counting || endsAt === null) return;
    const sec = Math.ceil(remaining);
    if (sec > 0 && sec <= 3 && lastBeepRef.current !== sec) {
      lastBeepRef.current = sec;
      cueCountdown();
      vibrate(50);
    }
  }, [remaining, mode, counting, endsAt]);

  // Reps items wait for the user to press Next manually — no auto-advance, so
  // they're not surprised mid-rep. Timed items auto-advance at zero.
  useEffect(() => {
    if (mode !== "running" || !counting || endsAt === null) return;
    if (remaining > 0) return;
    // Timer hit zero — sound the completion cue (a resolved chime on the last
    // item, a rising "next" cue otherwise) and auto-advance. The next item
    // waits on its own Start tap, so there's no rush to set up.
    const isLast = idx + 1 >= items.length;
    if (isLast) {
      cueDone();
      vibrate([200, 100, 200]);
    } else {
      cueAdvance();
      vibrate([120, 60, 120]);
    }
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, counting, mode, endsAt]);

  function start() {
    onStart?.();
    ensureAudio(); // unlock audio within the Start gesture
    setMode("running");
    setIdx(0);
    setEndsAt(null);
    setCounting(false);
  }

  // Begin the current timed item's countdown (its own Start button).
  function beginCountdown() {
    ensureAudio(); // unlock audio within the Start gesture
    const dur = items[idx]?.durationSec ?? 0;
    lastBeepRef.current = null;
    setNow(Date.now());
    setEndsAt(Date.now() + dur * 1000);
    setCounting(true);
  }

  function advance() {
    const next = idx + 1;
    setEndsAt(null);
    setCounting(false);
    if (next >= items.length) {
      setMode("done");
      return;
    }
    setIdx(next);
  }

  function skipAll() {
    // Skipping the warm-up still means "I'm starting now" — begin the session
    // timer so there's no dead-end where the workout can't be started.
    onStart?.();
    setEndsAt(null);
    setCounting(false);
    setMode("done");
  }

  function reset() {
    setMode("idle");
    setIdx(0);
    setEndsAt(null);
    setCounting(false);
  }

  if (mode === "idle") {
    return (
      <div
        className="mb-4 rounded-2xl p-4"
        style={{ background: "var(--surface)" }}
      >
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-[14px] font-semibold">Warm-up</h2>
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            ~{Math.round(totalDuration(items) / 60)} min · {items.length}{" "}
            item{items.length === 1 ? "" : "s"}
          </span>
        </div>

        <ul className="space-y-1.5 mb-3">
          {items.map((it, i) => (
            <li
              key={i}
              className="flex items-center justify-between text-[13px]"
            >
              <div className="flex items-center gap-2 min-w-0">
                {it.kind && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: KIND_COLOR[it.kind] }}
                  />
                )}
                <span className="truncate">{it.name}</span>
              </div>
              <span
                className="text-[11px] tabular-nums shrink-0 ml-2"
                style={{ color: "var(--fg-dim)" }}
              >
                {it.durationSec ? formatTime(it.durationSec) : `${it.reps} reps`}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={start}
            className="flex-1 rounded-xl py-2.5 text-[13px] font-semibold"
            style={{ background: "var(--accent)", color: "#000" }}
          >
            Start warm-up
          </button>
          <button
            type="button"
            onClick={skipAll}
            className="rounded-xl px-3 py-2.5 text-[12px]"
            style={{ background: "var(--bg-elevated)", color: "var(--fg-dim)" }}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (mode === "done") {
    return (
      <div
        className="mb-4 rounded-2xl p-3 flex items-center justify-between"
        style={{ background: "var(--accent-dim)", border: "1px solid rgba(34,197,94,0.25)" }}
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
            Warmed up — ready to lift
          </span>
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-[11px] underline"
          style={{ color: "var(--fg-dim)" }}
        >
          Replay
        </button>
      </div>
    );
  }

  const isTimed = !!current?.durationSec;
  return (
    <div
      className="mb-4 rounded-2xl p-4"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="flex items-center gap-2">
          {current.kind && (
            <span
              className="text-[9px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md"
              style={{
                background: `${KIND_COLOR[current.kind]}20`,
                color: KIND_COLOR[current.kind],
                letterSpacing: "0.1em",
              }}
            >
              {KIND_LABEL[current.kind]}
            </span>
          )}
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {idx + 1} / {items.length}
          </span>
        </div>
        <button
          type="button"
          onClick={skipAll}
          className="text-[11px] underline"
          style={{ color: "var(--fg-dim)" }}
        >
          Skip warmup
        </button>
      </div>

      <h3 className="text-[18px] font-bold leading-tight mb-1">{current.name}</h3>
      {current.instructions && (
        <p className="text-[12px] mb-3" style={{ color: "var(--fg-dim)" }}>
          {current.instructions}
        </p>
      )}

      <div className="flex items-end gap-3 mb-3">
        <div
          className="text-[42px] font-bold tabular-nums leading-none"
          style={{ color: "var(--fg)" }}
        >
          {isTimed ? formatTime(remaining) : `${current.reps}`}
        </div>
        <div
          className="text-[12px] pb-1"
          style={{ color: "var(--fg-dim)" }}
        >
          {isTimed ? (counting ? "remaining" : "ready") : "reps"}
        </div>
      </div>

      {isTimed && !counting ? (
        <button
          type="button"
          onClick={beginCountdown}
          className="w-full rounded-xl py-2.5 text-[13px] font-semibold flex items-center justify-center gap-2"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7z" />
          </svg>
          Start {formatTime(remaining)}
        </button>
      ) : (
        <button
          type="button"
          onClick={advance}
          className="w-full rounded-xl py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--accent)", color: "#000" }}
        >
          {idx === items.length - 1 ? "Done" : "Next"}
        </button>
      )}
    </div>
  );
}
