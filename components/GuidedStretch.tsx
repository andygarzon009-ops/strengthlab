"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildStretchSteps,
  routineDurationSec,
  type StretchKind,
  type StretchRoutine,
  type StretchStep,
} from "@/lib/stretchRoutine";

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

  const [mode, setMode] = useState<Mode>("idle");
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  // Wall-clock anchor for the running countdown. Deriving remaining from a real
  // end time (instead of decrementing on a setInterval, which browsers freeze
  // when the app is backgrounded) keeps the clock honest across screen-lock and
  // tab-switch. On pause we snapshot the remaining ms and re-anchor on resume.
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const pausedRemainingRef = useRef<number | null>(null);
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
        return;
      }
      const dur = steps[nextIdx]?.durationSec ?? 0;
      setIdx(nextIdx);
      setNow(Date.now());
      setEndsAt(Date.now() + dur * 1000);
    },
    [steps, releaseWakeLock],
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

  // Release the wake lock if the component unmounts mid-session.
  useEffect(() => releaseWakeLock, [releaseWakeLock]);

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
    } else {
      // Pause: snapshot remaining ms so resume picks up exactly where it froze.
      pausedRemainingRef.current =
        endsAt !== null ? Math.max(0, endsAt - Date.now()) : (current?.durationSec ?? 0) * 1000;
      setPaused(true);
    }
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
      <Shell onExit={onExit}>
        <div className="flex-1 overflow-y-auto px-5 pb-4">
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
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                    style={{ background: "var(--bg-elevated)", color: "var(--fg-dim)" }}
                  >
                    {i + 1}
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

        <div
          className="px-5 pt-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
        >
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
      <Shell onExit={onExit}>
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
          <p className="text-[13px] mb-8" style={{ color: "var(--fg-dim)" }}>
            {totalStretches} stretch{totalStretches === 1 ? "" : "es"} ·{" "}
            {Math.round(totalSec / 60)} min · nicely done.
          </p>
          <div className="w-full max-w-xs space-y-2">
            <button
              type="button"
              onClick={onExit}
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

        {isHold && (holdMeta || current?.side) && (
          <div className="flex items-center gap-2 mb-2">
            {holdMeta && (
              <span
                className="text-[11px] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded-full"
                style={{ background: `${holdMeta.color}22`, color: holdMeta.color }}
              >
                {holdMeta.label}
              </span>
            )}
            {current?.kind === "hold" && current.side && (
              <span
                className="text-[11px] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded-full"
                style={{ background: "var(--bg-elevated)", color: "var(--fg-dim)" }}
              >
                {SIDE_LABEL[current.side]}
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
          <p className="text-[13px] mb-1" style={{ color: "var(--fg-dim)" }}>
            {current.variant === "switch"
              ? "Switch to your right side"
              : current.variant === "getReady"
                ? "Get into position"
                : "Move into the next stretch"}
            {current.nextSide && current.variant !== "switch"
              ? ` · ${SIDE_LABEL[current.nextSide].toLowerCase()}`
              : ""}
          </p>
        )}
        {isHold && current.instructions && (
          <p className="text-[13px] mb-1 max-w-sm" style={{ color: "var(--fg-dim)" }}>
            {current.instructions}
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
            <div className="text-[56px] font-bold tabular-nums leading-none">
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
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: "var(--bg)",
        height: "100dvh",
        maxHeight: "100dvh",
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.5rem)",
      }}
    >
      <div className="flex justify-end px-4 pb-1">
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
