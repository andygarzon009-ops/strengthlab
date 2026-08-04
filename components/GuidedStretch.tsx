"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildStretchSteps,
  routineDurationSec,
  type StretchKind,
  type StretchRoutine,
  type StretchStep,
} from "@/lib/stretchRoutine";
import { logStretchWorkout } from "@/lib/actions/workouts";
import { resolvePose } from "@/lib/stretchPoses";
import StretchFigure from "./StretchFigure";

// --- Audio cues (mirrors components/GuidedWarmup.tsx) --------------------
// Web Audio beeps for the countdown. The context is created lazily and
// resumed on every access: browsers start it "suspended" and auto-suspend on
// tab-switch / screen-lock, after which tones are silent until a gesture
// resumes it. ensureAudio() runs from the Start tap so audio unlocks reliably.
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

// 3-2-1 tick before a hold or rest ends.
const cueCountdown = () => tone(660, 120, 0.18);
// Rising two-note cue when a hold completes and we move to the next thing.
const cueAdvance = () => {
  tone(880, 160);
  setTimeout(() => tone(1175, 240), 160);
};
// A softer single tone when a rest ends and a hold begins ("go").
const cueGo = () => tone(784, 200, 0.2);
// Resolved low tone when the whole routine finishes.
const cueDone = () => {
  tone(523, 200, 0.2);
  setTimeout(() => tone(392, 320, 0.2), 200);
};

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // ignore — unsupported or blocked
    }
  }
};

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const SIDE_LABEL: Record<"left" | "right", string> = {
  left: "Left side",
  right: "Right side",
};

// Modality label / color / countdown-verb for a mixed routine. Foam rolling,
// dynamic mobility, and breathing each read distinctly in the live player.
const KIND_META: Record<StretchKind, { label: string; color: string; verb: string }> = {
  static: { label: "Stretch", color: "#22c55e", verb: "hold" },
  dynamic: { label: "Mobility", color: "#60a5fa", verb: "keep moving" },
  foamroll: { label: "Foam roll", color: "#f97316", verb: "roll" },
  breathing: { label: "Breathe", color: "#a78bfa", verb: "breathe" },
};

type Mode = "idle" | "running" | "done";

// Live progress is mirrored here so the routine survives leaving and coming
// back to the page (same sessionStorage handoff the workout draft uses). We
// store which step and how much of it is left, plus a signature of the routine
// so a DIFFERENT routine's progress can never restore into this one.
const PROGRESS_KEY = "sl:stretchProgress";

type StretchProgress = {
  sig: string;
  idx: number;
  remainingMs: number;
  paused: boolean;
};

export default function GuidedStretch({
  routine,
  onExit,
}: {
  routine: StretchRoutine;
  onExit: () => void;
}) {
  const steps = useMemo<StretchStep[]>(() => buildStretchSteps(routine), [routine]);
  const totalStretches = routine.stretches.length;
  const totalSec = useMemo(() => routineDurationSec(routine), [routine]);
  const routineSig = useMemo(
    () => `${routine.stretches.length}:${routine.title ?? ""}`,
    [routine],
  );

  // Read any saved progress for THIS routine exactly once, so the state below
  // can initialize straight into the resumed step (no idle-screen flash).
  // Restored sessions come back PAUSED so time spent away never auto-skips
  // stretches — the athlete taps play when they're back in position.
  const bootRef = useRef<{ idx: number; remMs: number } | null | undefined>(
    undefined,
  );
  const boot = (): { idx: number; remMs: number } | null => {
    if (bootRef.current !== undefined) return bootRef.current;
    let r: { idx: number; remMs: number } | null = null;
    try {
      const raw = sessionStorage.getItem(PROGRESS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as StretchProgress;
        if (
          p &&
          p.sig === routineSig &&
          typeof p.idx === "number" &&
          p.idx >= 0 &&
          p.idx < steps.length
        ) {
          r = { idx: p.idx, remMs: Math.max(0, Number(p.remainingMs) || 0) };
        }
      }
    } catch {
      // ignore — falls through to a fresh start
    }
    bootRef.current = r;
    return r;
  };
  const exitingRef = useRef(false);

  const [mode, setMode] = useState<Mode>(() => (boot() ? "running" : "idle"));
  const [idx, setIdx] = useState(() => boot()?.idx ?? 0);
  const [paused, setPaused] = useState(() => !!boot());
  // Whether the finished session has been saved to the workout log.
  const [logState, setLogState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const loggedRef = useRef(false);

  // Wall-clock anchor for the running countdown. Deriving remaining from a real
  // end time (instead of decrementing on a setInterval, which browsers freeze
  // when the app is backgrounded) keeps the clock honest across screen-lock and
  // tab-switch. On pause we snapshot the remaining ms and re-anchor on resume.
  // When restoring, anchor endsAt to now + remaining; paused freezes the tick
  // so it displays that remaining until the athlete resumes.
  const [endsAt, setEndsAt] = useState<number | null>(() => {
    const b = boot();
    return b ? Date.now() + b.remMs : null;
  });
  const [now, setNow] = useState(() => Date.now());
  const pausedRemainingRef = useRef<number | null>(boot()?.remMs ?? null);
  const lastBeepRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const current = steps[idx];
  const remaining =
    endsAt !== null ? Math.max(0, (endsAt - now) / 1000) : current?.durationSec ?? 0;

  // Keep the screen awake for the length of the session (best-effort).
  const acquireWakeLock = useCallback(async () => {
    try {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: "screen") => Promise<WakeLockSentinel> };
      };
      if (nav.wakeLock && !wakeLockRef.current) {
        wakeLockRef.current = await nav.wakeLock.request("screen");
      }
    } catch {
      // Not supported / denied — the countdown still runs, screen may dim.
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    try {
      void wakeLockRef.current?.release();
    } catch {
      // ignore
    }
    wakeLockRef.current = null;
  }, []);

  // Persist / clear the resume point in sessionStorage.
  const saveProgress = useCallback(
    (remMs: number, curIdx: number, isPaused: boolean) => {
      try {
        const p: StretchProgress = {
          sig: routineSig,
          idx: curIdx,
          remainingMs: Math.max(0, Math.round(remMs)),
          paused: isPaused,
        };
        sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
      } catch {
        // ignore — resume just won't be available
      }
    },
    [routineSig],
  );
  const clearProgress = useCallback(() => {
    try {
      sessionStorage.removeItem(PROGRESS_KEY);
    } catch {
      // ignore
    }
  }, []);

  // Advance to the next step, or finish. Anchors the next step's countdown.
  const goTo = useCallback(
    (nextIdx: number) => {
      lastBeepRef.current = null;
      pausedRemainingRef.current = null;
      if (nextIdx >= steps.length) {
        setEndsAt(null);
        setMode("done");
        cueDone();
        vibrate([200, 100, 200]);
        releaseWakeLock();
        clearProgress(); // routine finished — nothing to resume
        return;
      }
      const dur = steps[nextIdx]?.durationSec ?? 0;
      setIdx(nextIdx);
      setNow(Date.now());
      setEndsAt(Date.now() + dur * 1000);
      saveProgress(dur * 1000, nextIdx, false);
    },
    [steps, releaseWakeLock, saveProgress, clearProgress],
  );

  // Drive the displayed countdown from the wall clock, and re-sync the instant
  // the app returns to the foreground (and re-acquire the wake lock, which the
  // browser drops on background) so a background stint leaves nothing stale.
  useEffect(() => {
    if (mode !== "running" || paused || endsAt === null) return;
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, 200);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        ensureAudio();
        void acquireWakeLock();
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
  }, [mode, paused, endsAt, acquireWakeLock]);

  // Audible 3-2-1 countdown in the final seconds of a hold or rest.
  useEffect(() => {
    if (mode !== "running" || paused || endsAt === null) return;
    const sec = Math.ceil(remaining);
    if (sec > 0 && sec <= 3 && lastBeepRef.current !== sec) {
      lastBeepRef.current = sec;
      cueCountdown();
      vibrate(40);
    }
  }, [remaining, mode, paused, endsAt]);

  // Auto-advance when the current step's clock hits zero.
  useEffect(() => {
    if (mode !== "running" || paused || endsAt === null) return;
    if (remaining > 0) return;
    // Fire the transition cue: a "go" tone when a rest ends into a hold, a
    // rising "next" cue when a hold ends.
    const finished = steps[idx];
    const next = steps[idx + 1];
    if (finished?.kind === "rest") {
      cueGo();
      vibrate(80);
    } else if (next) {
      cueAdvance();
      vibrate([120, 60, 120]);
    }
    goTo(idx + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, mode, paused, endsAt]);

  // Keep a snapshot of the live position fresh on every render so the unmount
  // handler below can persist the exact mid-step remaining when the athlete
  // navigates away — effect closures would otherwise capture stale values.
  const liveRef = useRef({ mode, idx, remainingMs: 0 });
  useEffect(() => {
    liveRef.current = { mode, idx, remainingMs: Math.round(remaining * 1000) };
  });

  // On unmount: release the wake lock, and — unless the athlete deliberately
  // exited — freeze the current position to sessionStorage as PAUSED so
  // leaving the page (bottom nav, a link) and returning resumes right here
  // instead of losing the routine.
  useEffect(() => {
    return () => {
      releaseWakeLock();
      if (exitingRef.current) return;
      const l = liveRef.current;
      if (l.mode === "running") saveProgress(l.remainingMs, l.idx, true);
    };
  }, [releaseWakeLock, saveProgress]);

  // Save the finished routine as a MOBILITY workout. Reused by the auto-log on
  // completion and the manual Retry button, so a failure never loops.
  const logSession = useCallback(() => {
    setLogState("saving");
    return logStretchWorkout({ routine, elapsedSec: totalSec })
      .then(() => setLogState("saved"))
      .catch(() => setLogState("error"));
  }, [routine, totalSec]);

  // When the routine completes, log it exactly once (survives re-render /
  // strict-mode double-run). On failure we stop and show a Retry button rather
  // than re-firing, so a persistent error can't spam createWorkout.
  useEffect(() => {
    if (mode !== "done" || loggedRef.current) return;
    loggedRef.current = true;
    void logSession();
  }, [mode, logSession]);

  function start() {
    ensureAudio(); // unlock audio within the Start gesture
    void acquireWakeLock();
    setMode("running");
    setPaused(false);
    goTo(0);
  }

  function togglePause() {
    if (paused) {
      // Resume: re-anchor the end time from the snapshotted remaining ms.
      const rem = pausedRemainingRef.current ?? (current?.durationSec ?? 0) * 1000;
      pausedRemainingRef.current = null;
      lastBeepRef.current = null;
      ensureAudio();
      void acquireWakeLock();
      setNow(Date.now());
      setEndsAt(Date.now() + rem);
      setPaused(false);
      saveProgress(rem, idx, false);
    } else {
      // Pause: snapshot remaining ms so resume picks up exactly where it froze.
      const rem =
        endsAt !== null ? Math.max(0, endsAt - Date.now()) : (current?.durationSec ?? 0) * 1000;
      pausedRemainingRef.current = rem;
      setPaused(true);
      saveProgress(rem, idx, true);
    }
  }

  // Deliberate exit (the X): don't leave a resume point behind.
  function handleExit() {
    exitingRef.current = true;
    clearProgress();
    onExit();
  }

  function skip() {
    // Skip the current step immediately (no cue — the athlete chose it).
    goTo(idx + 1);
    if (paused) setPaused(false);
  }

  function prev() {
    // Jump back to the start of the previous step.
    goTo(Math.max(0, idx - 1));
    if (paused) setPaused(false);
  }

  function replay() {
    clearProgress();
    loggedRef.current = false; // a fresh run is a new session to log
    setLogState("idle");
    setMode("idle");
    setIdx(0);
    setEndsAt(null);
    setPaused(false);
    pausedRemainingRef.current = null;
    lastBeepRef.current = null;
  }

  // ---- IDLE: routine overview + Start ------------------------------------
  if (mode === "idle") {
    return (
      <Shell onExit={handleExit}>
        <div className="px-5 pb-4">
          <p
            className="text-[11px] font-semibold tracking-[0.14em] uppercase mb-1"
            style={{ color: "var(--accent)" }}
          >
            Stretching routine
          </p>
          <h1 className="text-[24px] font-bold leading-tight mb-1">
            {routine.title || "Stretch & Recover"}
          </h1>
          <p className="text-[12px] mb-5" style={{ color: "var(--fg-dim)" }}>
            ~{Math.round(totalSec / 60)} min · {totalStretches} stretch
            {totalStretches === 1 ? "" : "es"} · guided with a live timer
          </p>

          <ul className="space-y-2">
            {routine.stretches.map((s, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-2xl px-4 py-3"
                style={{ background: "var(--surface)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* A still preview of the drill, so the athlete can see what
                      they're in for before starting. It animates in the live
                      player; here it holds frame one. */}
                  <span
                    className="w-12 h-10 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "var(--bg-elevated)" }}
                  >
                    <StretchFigure
                      pose={resolvePose(s.pose, s.name, s.kind)}
                      size={46}
                      animate={false}
                      color={s.kind && KIND_META[s.kind] ? KIND_META[s.kind].color : "var(--fg-dim)"}
                    />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {s.kind && KIND_META[s.kind] && (
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: KIND_META[s.kind].color }}
                        />
                      )}
                      <span className="text-[14px] font-medium truncate">{s.name}</span>
                    </div>
                    {(s.instructions || (s.kind && s.kind !== "static")) && (
                      <div
                        className="text-[11px] truncate"
                        style={{ color: "var(--fg-dim)" }}
                      >
                        {s.kind && s.kind !== "static" && KIND_META[s.kind]
                          ? s.instructions
                            ? `${KIND_META[s.kind].label} · ${s.instructions}`
                            : KIND_META[s.kind].label
                          : s.instructions}
                      </div>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0 ml-3">
                  <div className="text-[13px] font-semibold tabular-nums">
                    {formatTime(s.durationSec)}
                  </div>
                  {s.side === "both" && (
                    <div className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
                      each side
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="px-5 pt-3 pb-6">
          <button
            type="button"
            onClick={start}
            className="w-full rounded-2xl py-4 text-[15px] font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-transform"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
            Start routine
          </button>
        </div>
      </Shell>
    );
  }

  // ---- DONE --------------------------------------------------------------
  if (mode === "done") {
    return (
      <Shell onExit={handleExit}>
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-5"
            style={{ background: "var(--accent-dim)", border: "1px solid rgba(34,197,94,0.3)" }}
          >
            <svg
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold mb-1">All stretched out</h1>
          <p className="text-[13px] mb-3" style={{ color: "var(--fg-dim)" }}>
            {totalStretches} stretch{totalStretches === 1 ? "" : "es"} ·{" "}
            {Math.round(totalSec / 60)} min · nicely done.
          </p>
          <div
            className="text-[12px] mb-8 inline-flex items-center gap-1.5"
            style={{
              color: logState === "error" ? "#ef4444" : "var(--accent)",
            }}
          >
            {logState === "saving" && <span>Saving to your log…</span>}
            {logState === "saved" && (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Saved to your log</span>
              </>
            )}
            {logState === "error" && (
              <>
                <span>Couldn’t save to your log</span>
                <button
                  type="button"
                  onClick={() => void logSession()}
                  className="underline font-semibold"
                  style={{ color: "var(--accent)" }}
                >
                  Retry
                </button>
              </>
            )}
          </div>
          <div className="w-full max-w-xs space-y-2">
            <button
              type="button"
              onClick={handleExit}
              className="w-full rounded-2xl py-3.5 text-[14px] font-bold active:scale-[0.99] transition-transform"
              style={{ background: "var(--accent)", color: "#0a0a0a" }}
            >
              Done
            </button>
            <button
              type="button"
              onClick={replay}
              className="w-full rounded-2xl py-3 text-[13px] font-medium active:scale-[0.99] transition-transform"
              style={{ background: "var(--surface)", color: "var(--fg-dim)" }}
            >
              Replay routine
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---- RUNNING -----------------------------------------------------------
  const isHold = current?.kind === "hold";
  const holdMeta =
    isHold && current?.kind === "hold" && current.modality
      ? KIND_META[current.modality]
      : null;
  const stretchNum = (current?.stretchIndex ?? 0) + 1;
  // During a rest, the very next step is always the hold this rest leads into
  // (buildStretchSteps emits rest → hold). Surface its instructions NOW so the
  // athlete can get into position before the hold's clock starts, instead of
  // reading them only once the timer is already running.
  const upcoming =
    current?.kind === "rest" && steps[idx + 1]?.kind === "hold"
      ? steps[idx + 1]
      : null;
  const upcomingMeta =
    upcoming?.kind === "hold" && upcoming.modality ? KIND_META[upcoming.modality] : null;
  // Show the modality/side badges and instructions for whichever stretch is
  // relevant right now: the running hold, or (during a rest) the one coming up.
  const badgeMeta = isHold ? holdMeta : upcomingMeta;
  const badgeSide = isHold
    ? current?.kind === "hold"
      ? current.side
      : null
    : upcoming?.kind === "hold"
      ? upcoming.side
      : null;
  const activeInstructions = isHold
    ? current?.kind === "hold"
      ? current.instructions
      : undefined
    : upcoming?.kind === "hold"
      ? upcoming.instructions
      : undefined;
  // The figure follows the same "what matters right now" rule as the badges:
  // the running hold, or — during a rest — the hold that rest leads into, so
  // the athlete can see the shape before its clock starts. Right-side reps
  // render mirrored so left and right are visibly different.
  const activeHold =
    isHold && current?.kind === "hold"
      ? current
      : upcoming?.kind === "hold"
        ? upcoming
        : null;
  const activePose = activeHold
    ? resolvePose(activeHold.pose, activeHold.name, activeHold.modality)
    : null;

  const fullDur = current?.durationSec ?? 1;
  const progress = Math.min(1, Math.max(0, 1 - remaining / fullDur));

  // Ring geometry.
  const R = 130;
  const C = 2 * Math.PI * R;

  const restVariantLabel =
    current?.kind === "rest"
      ? current.variant === "getReady"
        ? "Get ready"
        : current.variant === "switch"
          ? "Switch sides"
          : "Rest"
      : "";

  const accent = isHold ? holdMeta?.color ?? "var(--accent)" : "#f59e0b";

  return (
    <Shell onExit={onExit}>
      {/* progress across stretches */}
      <div className="px-5 pt-1 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold" style={{ color: "var(--fg-dim)" }}>
            Stretch {stretchNum} of {totalStretches}
          </span>
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            {isHold ? holdMeta?.label ?? "Hold" : restVariantLabel}
          </span>
        </div>
        <div className="flex gap-1">
          {routine.stretches.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full overflow-hidden"
              style={{ background: "var(--bg-elevated)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width:
                    i < (current?.stretchIndex ?? 0)
                      ? "100%"
                      : i === (current?.stretchIndex ?? 0) && isHold
                        ? `${progress * 100}%`
                        : i === (current?.stretchIndex ?? 0)
                          ? "0%"
                          : "0%",
                  background: "var(--accent)",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        {current?.kind === "rest" && (
          <span
            className="text-[12px] font-bold tracking-[0.16em] uppercase mb-2"
            style={{ color: accent }}
          >
            {restVariantLabel}
          </span>
        )}

        {(badgeMeta || badgeSide) && (
          <div className="flex items-center gap-2 mb-2">
            {badgeMeta && (
              <span
                className="text-[11px] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded-full"
                style={{ background: `${badgeMeta.color}22`, color: badgeMeta.color }}
              >
                {badgeMeta.label}
              </span>
            )}
            {badgeSide && (
              <span
                className="text-[11px] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded-full"
                style={{ background: "var(--bg-elevated)", color: "var(--fg-dim)" }}
              >
                {SIDE_LABEL[badgeSide]}
              </span>
            )}
          </div>
        )}

        <h1 className="text-[26px] font-bold leading-tight mb-1 max-w-md">
          {isHold
            ? current.name
            : current?.kind === "rest"
              ? current.nextName
              : ""}
        </h1>

        {current?.kind === "rest" && (
          <p
            className="text-[12px] font-semibold mb-1"
            style={{ color: accent }}
          >
            {current.variant === "switch"
              ? "Switch to your right side"
              : current.variant === "getReady"
                ? "Get into position"
                : "Get into position for the next one"}
            {current.nextSide && current.variant !== "switch"
              ? ` · ${SIDE_LABEL[current.nextSide].toLowerCase()}`
              : ""}
          </p>
        )}
        {activeInstructions && (
          <p className="text-[13px] mb-1 max-w-sm" style={{ color: "var(--fg-dim)" }}>
            {activeInstructions}
          </p>
        )}

        {/* countdown ring */}
        <div className="relative my-6" style={{ width: 2 * (R + 16), height: 2 * (R + 16) }}>
          <svg
            width={2 * (R + 16)}
            height={2 * (R + 16)}
            viewBox={`0 0 ${2 * (R + 16)} ${2 * (R + 16)}`}
            style={{ transform: "rotate(-90deg)" }}
          >
            <circle
              cx={R + 16}
              cy={R + 16}
              r={R}
              fill="none"
              stroke="var(--bg-elevated)"
              strokeWidth="10"
            />
            <circle
              cx={R + 16}
              cy={R + 16}
              r={R}
              fill="none"
              stroke={accent}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={C * progress}
              style={{ transition: paused ? "none" : "stroke-dashoffset 0.2s linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {activePose && (
              <StretchFigure
                pose={activePose}
                mirror={activeHold?.side === "right"}
                size={172}
                color={badgeMeta?.color ?? accent}
                // While paused the figure freezes too — a moving demo next to a
                // stopped clock reads as if the routine is still running.
                animate={!paused}
                className="mb-1"
              />
            )}
            <div className="text-[42px] font-bold tabular-nums leading-none">
              {formatTime(remaining)}
            </div>
            <div className="text-[12px] mt-1" style={{ color: "var(--fg-dim)" }}>
              {paused ? "paused" : isHold ? holdMeta?.verb ?? "hold" : "remaining"}
            </div>
          </div>
        </div>

        {/* controls */}
        <div className="flex items-center gap-3">
          <CtrlButton onClick={prev} label="Back" disabled={idx === 0}>
            <path d="M11 19l-7-7 7-7M20 19l-7-7 7-7" />
          </CtrlButton>
          <button
            type="button"
            onClick={togglePause}
            className="w-16 h-16 rounded-full flex items-center justify-center active:scale-95 transition-transform"
            style={{ background: "var(--accent)", color: "#0a0a0a" }}
            aria-label={paused ? "Resume" : "Pause"}
          >
            {paused ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            )}
          </button>
          <CtrlButton onClick={skip} label="Skip">
            <path d="M5 5l7 7-7 7M13 5l7 7-7 7" />
          </CtrlButton>
        </div>
      </div>
    </Shell>
  );
}

function CtrlButton({
  onClick,
  label,
  disabled,
  children,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-12 h-12 rounded-full flex items-center justify-center active:scale-95 transition-transform disabled:opacity-30"
      style={{ background: "var(--surface)", color: "var(--fg)" }}
      aria-label={label}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {children}
      </svg>
    </button>
  );
}

// Full-screen shell with a close (X) that leaves the player. Fixed + high z so
// it sits over the bottom nav for a distraction-free live session.
function Shell({ children, onExit }: { children: React.ReactNode; onExit: () => void }) {
  return (
    // A normal in-flow dashboard page, NOT a full-screen overlay — so the
    // bottom nav, the floating coach button, and the rest timer all stay
    // reachable while a routine runs. The athlete can open the coach to ask a
    // question mid-stretch; that chat opens as its own overlay and this page
    // stays mounted underneath, so the wall-clock timer keeps ticking and is
    // still correct when they come back. min-height fills the band above the
    // nav (the dashboard layout already reserves the nav's height) so the
    // running view can center its ring.
    <div
      className="flex flex-col"
      style={{ minHeight: "calc(100dvh - 8rem)" }}
    >
      <div className="flex justify-end px-4 pt-1 pb-1">
        <button
          type="button"
          onClick={onExit}
          className="w-9 h-9 rounded-full flex items-center justify-center active:scale-95 transition-transform"
          style={{ background: "var(--surface)", color: "var(--fg-dim)" }}
          aria-label="Exit routine"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      {children}
    </div>
  );
}
