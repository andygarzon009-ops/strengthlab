"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const INTERVAL_KEY = "strengthlab.timer.interval.v1";
const PRESETS_KEY = "strengthlab.timer.intervalPresets.v1";
const COUNTDOWN_KEY = "strengthlab.timer.countdown.v1";
const AMRAP_KEY = "strengthlab.timer.amrap.v1";
const MODE_KEY = "strengthlab.timer.mode.v1";
// Live running-state keys. iOS Safari aggressively evicts background tabs
// when the screen locks, so React state alone gets wiped — the FAB looks
// "reset" on unlock. Persisting wall-clock anchors (cdEndsAt etc.) means
// we can rehydrate the actual remaining time on the next mount.
const CD_RUN_KEY = "strengthlab.timer.cdRun.v1";

type Mode = "INTERVAL" | "STOPWATCH" | "COUNTDOWN" | "AMRAP";
type Phase = "IDLE" | "PREP" | "WORK" | "REST" | "DONE";

type IntervalConfig = {
  workSeconds: number;
  restSeconds: number;
  rounds: number;
  prepSeconds: number;
};

const DEFAULT_INTERVAL: IntervalConfig = {
  workSeconds: 40,
  restSeconds: 20,
  rounds: 8,
  prepSeconds: 5,
};

const BUILT_IN_PRESETS: { name: string; config: IntervalConfig }[] = [
  { name: "Tabata", config: { workSeconds: 20, restSeconds: 10, rounds: 8, prepSeconds: 5 } },
  { name: "HIIT 40/20", config: { workSeconds: 40, restSeconds: 20, rounds: 8, prepSeconds: 5 } },
  { name: "HIIT 30/30", config: { workSeconds: 30, restSeconds: 30, rounds: 10, prepSeconds: 5 } },
  { name: "EMOM 1m", config: { workSeconds: 60, restSeconds: 0, rounds: 10, prepSeconds: 5 } },
  { name: "EMOM 2m", config: { workSeconds: 120, restSeconds: 0, rounds: 10, prepSeconds: 5 } },
];

type AudioBag = { ctx: AudioContext };
let audioBag: AudioBag | null = null;

function ensureAudio(): AudioBag | null {
  if (audioBag) return audioBag;
  try {
    type W = Window & { webkitAudioContext?: typeof AudioContext };
    const w = window as W;
    const AC = window.AudioContext ?? w.webkitAudioContext;
    if (!AC) return null;
    audioBag = { ctx: new AC() };
    return audioBag;
  } catch {
    return null;
  }
}

function tone(freq: number, durationMs: number, gainPeak = 0.25) {
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

const cueCountdown = () => tone(660, 120, 0.18);
const cueWork = () => {
  tone(880, 180);
  setTimeout(() => tone(1175, 280), 180);
};
const cueRest = () => tone(440, 280, 0.2);
const cueDone = () => {
  tone(1175, 200);
  setTimeout(() => tone(880, 200), 220);
  setTimeout(() => tone(587, 400), 460);
};
const cueTick = () => tone(800, 60, 0.15);
const cueRound = () => tone(1320, 100, 0.18);

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(pattern);
  }
};

const fmtMMSS = (s: number) => {
  const total = Math.max(0, Math.ceil(s));
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

const fmtMMSSCC = (ms: number) => {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const cc = Math.floor((total % 1000) / 10);
  return `${m}:${s.toString().padStart(2, "0")}.${cc.toString().padStart(2, "0")}`;
};

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function Timer() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("INTERVAL");
  const [coachOpen, setCoachOpen] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ open: boolean }>;
      setCoachOpen(!!ce.detail?.open);
    };
    window.addEventListener("strengthlab:coach-toggle", handler);
    return () => window.removeEventListener("strengthlab:coach-toggle", handler);
  }, []);

  // External "rest-start" trigger — fired by ExerciseLogger when the user
  // logs a working set. Switches to countdown mode and starts the timer
  // so the floating FAB immediately shows the remaining rest seconds.
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ seconds?: number }>;
      const secs = Math.max(5, Math.round(ce.detail?.seconds ?? 90));
      ensureAudio();
      setMode("COUNTDOWN");
      setCdConfigSeconds(secs);
      cdBeepRef.current = null;
      cdFiredRef.current = false;
      setCdPaused(null);
      setCdEndsAt(Date.now() + secs * 1000);
    };
    window.addEventListener("strengthlab:rest-start", handler);
    return () => window.removeEventListener("strengthlab:rest-start", handler);
  }, []);

  // Shared tick.
  const [now, setNow] = useState(() => Date.now());

  // Interval state.
  const [intervalConfig, setIntervalConfig] = useState<IntervalConfig>(DEFAULT_INTERVAL);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [round, setRound] = useState(1);
  const [phaseEndsAt, setPhaseEndsAt] = useState<number | null>(null);
  const [intervalPaused, setIntervalPaused] = useState<number | null>(null);
  const [customPresets, setCustomPresets] = useState<{ name: string; config: IntervalConfig }[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const lastBeepRef = useRef<number | null>(null);

  // Stopwatch state.
  const [swStartedAt, setSwStartedAt] = useState<number | null>(null);
  const [swElapsedBeforePause, setSwElapsedBeforePause] = useState(0);
  const [swLaps, setSwLaps] = useState<number[]>([]);

  // Countdown state.
  const [cdConfigSeconds, setCdConfigSeconds] = useState(300);
  const [cdEndsAt, setCdEndsAt] = useState<number | null>(null);
  const [cdPaused, setCdPaused] = useState<number | null>(null);
  const cdBeepRef = useRef<number | null>(null);
  const cdFiredRef = useRef(false);

  // AMRAP state.
  const [amrapConfigSeconds, setAmrapConfigSeconds] = useState(600);
  const [amrapEndsAt, setAmrapEndsAt] = useState<number | null>(null);
  const [amrapPaused, setAmrapPaused] = useState<number | null>(null);
  const [amrapRounds, setAmrapRounds] = useState(0);
  const amrapBeepRef = useRef<number | null>(null);
  const amrapFiredRef = useRef(false);

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Hydrate from localStorage.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntervalConfig(readJSON(INTERVAL_KEY, DEFAULT_INTERVAL));
    setCustomPresets(readJSON(PRESETS_KEY, []));
    setCdConfigSeconds(readJSON(COUNTDOWN_KEY, 300));
    setAmrapConfigSeconds(readJSON(AMRAP_KEY, 600));
    setMode(readJSON<Mode>(MODE_KEY, "INTERVAL"));

    // Restore an in-progress countdown if the page was reloaded while it
    // was running (most commonly: iOS evicted the tab during a screen
    // lock). If endsAt is already in the past we silently skip — the
    // user already missed the bell, no point in re-firing it.
    const cdRun = readJSON<{ endsAt: number | null; paused: number | null }>(
      CD_RUN_KEY,
      { endsAt: null, paused: null }
    );
    if (cdRun.paused !== null && cdRun.paused > 0) {
      setCdPaused(cdRun.paused);
      setMode("COUNTDOWN");
    } else if (cdRun.endsAt && cdRun.endsAt > Date.now()) {
      setCdEndsAt(cdRun.endsAt);
      setMode("COUNTDOWN");
    } else {
      // Stale entry — clear so we don't re-hydrate an already-finished run.
      try {
        localStorage.removeItem(CD_RUN_KEY);
      } catch {
        // ignore
      }
    }
  }, []);

  // Persist countdown running state on every change so the next mount
  // (after a screen lock or refresh) can pick up the same wall-clock
  // anchor instead of falling back to the default duration.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (cdEndsAt === null && cdPaused === null) {
      try {
        localStorage.removeItem(CD_RUN_KEY);
      } catch {
        // ignore
      }
      return;
    }
    try {
      localStorage.setItem(
        CD_RUN_KEY,
        JSON.stringify({ endsAt: cdEndsAt, paused: cdPaused })
      );
    } catch {
      // ignore
    }
  }, [cdEndsAt, cdPaused]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(INTERVAL_KEY, JSON.stringify(intervalConfig));
  }, [intervalConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(COUNTDOWN_KEY, JSON.stringify(cdConfigSeconds));
  }, [cdConfigSeconds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(AMRAP_KEY, JSON.stringify(amrapConfigSeconds));
  }, [amrapConfigSeconds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(MODE_KEY, JSON.stringify(mode));
  }, [mode]);

  const intervalRunning = phase !== "IDLE" && phase !== "DONE" && intervalPaused === null;
  const swRunning = swStartedAt !== null;
  const cdRunning = cdEndsAt !== null;
  const amrapRunning = amrapEndsAt !== null;
  const anyRunning = intervalRunning || swRunning || cdRunning || amrapRunning;

  useEffect(() => {
    if (!anyRunning) return;
    const id = setInterval(() => setNow(Date.now()), swRunning ? 50 : 100);
    return () => clearInterval(id);
  }, [anyRunning, swRunning]);

  // ---------- INTERVAL ----------
  const intervalRemaining = (() => {
    if (intervalPaused !== null) return intervalPaused;
    if (phaseEndsAt === null) return 0;
    return Math.max(0, (phaseEndsAt - now) / 1000);
  })();

  const startPhase = useCallback(
    (next: Phase) => {
      const seconds =
        next === "PREP"
          ? intervalConfig.prepSeconds
          : next === "WORK"
          ? intervalConfig.workSeconds
          : next === "REST"
          ? intervalConfig.restSeconds
          : 0;
      setPhase(next);
      setPhaseEndsAt(seconds > 0 ? Date.now() + seconds * 1000 : null);
      lastBeepRef.current = null;
      if (next === "WORK") {
        cueWork();
        vibrate([200, 80, 200]);
      } else if (next === "REST") {
        cueRest();
        vibrate(120);
      } else if (next === "DONE") {
        cueDone();
        vibrate([200, 100, 200, 100, 400]);
      }
    },
    [intervalConfig]
  );

  useEffect(() => {
    if (!intervalRunning) return;
    if (intervalRemaining > 0) return;
    if (phase === "PREP") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRound(1);
      startPhase("WORK");
    } else if (phase === "WORK") {
      if (round >= intervalConfig.rounds) {
        startPhase("DONE");
      } else if (intervalConfig.restSeconds <= 0) {
        setRound((r) => r + 1);
        startPhase("WORK");
      } else {
        startPhase("REST");
      }
    } else if (phase === "REST") {
      setRound((r) => r + 1);
      startPhase("WORK");
    }
  }, [intervalRemaining, phase, round, intervalConfig, intervalRunning, startPhase]);

  useEffect(() => {
    if (!intervalRunning) return;
    const sec = Math.ceil(intervalRemaining);
    if (sec > 0 && sec <= 3 && lastBeepRef.current !== sec) {
      lastBeepRef.current = sec;
      cueCountdown();
    }
  }, [intervalRemaining, intervalRunning]);

  const startInterval = () => {
    ensureAudio();
    setRound(1);
    startPhase(intervalConfig.prepSeconds > 0 ? "PREP" : "WORK");
  };
  const pauseInterval = () => {
    if (phaseEndsAt === null) return;
    setIntervalPaused(Math.max(0, (phaseEndsAt - Date.now()) / 1000));
    setPhaseEndsAt(null);
  };
  const resumeInterval = () => {
    if (intervalPaused === null) return;
    setPhaseEndsAt(Date.now() + intervalPaused * 1000);
    setIntervalPaused(null);
  };
  const resetInterval = () => {
    setPhase("IDLE");
    setRound(1);
    setPhaseEndsAt(null);
    setIntervalPaused(null);
  };
  const skipPhase = () => {
    if (phase === "IDLE" || phase === "DONE") return;
    setPhaseEndsAt(Date.now());
    setIntervalPaused(null);
    setNow(Date.now());
  };

  const totalIntervalWorkout = (() => {
    const cycle = intervalConfig.workSeconds + intervalConfig.restSeconds;
    const last = intervalConfig.workSeconds;
    return intervalConfig.prepSeconds + cycle * (intervalConfig.rounds - 1) + last;
  })();

  // ---------- STOPWATCH ----------
  const swElapsedMs = swStartedAt !== null ? now - swStartedAt : swElapsedBeforePause;

  const startSw = () => {
    ensureAudio();
    setSwStartedAt(Date.now() - swElapsedBeforePause);
    setSwElapsedBeforePause(0);
    setNow(Date.now());
  };
  const pauseSw = () => {
    if (swStartedAt === null) return;
    setSwElapsedBeforePause(Date.now() - swStartedAt);
    setSwStartedAt(null);
  };
  const resetSw = () => {
    setSwStartedAt(null);
    setSwElapsedBeforePause(0);
    setSwLaps([]);
  };
  const lapSw = () => {
    if (swStartedAt === null && swElapsedBeforePause === 0) return;
    setSwLaps((prev) => [...prev, swElapsedMs]);
    cueTick();
  };

  // ---------- COUNTDOWN ----------
  const cdRemaining = (() => {
    if (cdPaused !== null) return cdPaused;
    if (cdEndsAt === null) return cdConfigSeconds;
    return Math.max(0, (cdEndsAt - now) / 1000);
  })();

  useEffect(() => {
    if (!cdRunning) {
      cdFiredRef.current = false;
      return;
    }
    if (cdRemaining === 0 && !cdFiredRef.current) {
      cdFiredRef.current = true;
      cueDone();
      vibrate([200, 100, 200, 100, 400]);
      setCdEndsAt(null);
    }
  }, [cdRemaining, cdRunning]);

  useEffect(() => {
    if (!cdRunning) return;
    const sec = Math.ceil(cdRemaining);
    if (sec > 0 && sec <= 3 && cdBeepRef.current !== sec) {
      cdBeepRef.current = sec;
      cueCountdown();
    }
  }, [cdRemaining, cdRunning]);

  const startCd = () => {
    if (cdConfigSeconds <= 0) return;
    ensureAudio();
    cdBeepRef.current = null;
    cdFiredRef.current = false;
    setCdEndsAt(Date.now() + cdConfigSeconds * 1000);
    setCdPaused(null);
  };
  const pauseCd = () => {
    if (cdEndsAt === null) return;
    setCdPaused(Math.max(0, (cdEndsAt - Date.now()) / 1000));
    setCdEndsAt(null);
  };
  const resumeCd = () => {
    if (cdPaused === null) return;
    setCdEndsAt(Date.now() + cdPaused * 1000);
    setCdPaused(null);
  };
  const resetCd = () => {
    setCdEndsAt(null);
    setCdPaused(null);
    cdBeepRef.current = null;
    cdFiredRef.current = false;
  };

  // ---------- AMRAP ----------
  const amrapRemaining = (() => {
    if (amrapPaused !== null) return amrapPaused;
    if (amrapEndsAt === null) return amrapConfigSeconds;
    return Math.max(0, (amrapEndsAt - now) / 1000);
  })();

  useEffect(() => {
    if (!amrapRunning) {
      amrapFiredRef.current = false;
      return;
    }
    if (amrapRemaining === 0 && !amrapFiredRef.current) {
      amrapFiredRef.current = true;
      cueDone();
      vibrate([200, 100, 200, 100, 400]);
      setAmrapEndsAt(null);
    }
  }, [amrapRemaining, amrapRunning]);

  useEffect(() => {
    if (!amrapRunning) return;
    const sec = Math.ceil(amrapRemaining);
    if (sec > 0 && sec <= 5 && amrapBeepRef.current !== sec) {
      amrapBeepRef.current = sec;
      cueCountdown();
    }
  }, [amrapRemaining, amrapRunning]);

  const startAmrap = () => {
    if (amrapConfigSeconds <= 0) return;
    ensureAudio();
    amrapBeepRef.current = null;
    amrapFiredRef.current = false;
    setAmrapRounds(0);
    setAmrapEndsAt(Date.now() + amrapConfigSeconds * 1000);
    setAmrapPaused(null);
  };
  const pauseAmrap = () => {
    if (amrapEndsAt === null) return;
    setAmrapPaused(Math.max(0, (amrapEndsAt - Date.now()) / 1000));
    setAmrapEndsAt(null);
  };
  const resumeAmrap = () => {
    if (amrapPaused === null) return;
    setAmrapEndsAt(Date.now() + amrapPaused * 1000);
    setAmrapPaused(null);
  };
  const resetAmrap = () => {
    setAmrapEndsAt(null);
    setAmrapPaused(null);
    setAmrapRounds(0);
    amrapBeepRef.current = null;
    amrapFiredRef.current = false;
  };
  const tapRound = () => {
    if (!amrapRunning) return;
    setAmrapRounds((r) => r + 1);
    cueRound();
    vibrate(40);
  };

  useEffect(() => {
    const release = async () => {
      try {
        await wakeLockRef.current?.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
    };
    if (!anyRunning) {
      release();
      return;
    }
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const lock = await navigator.wakeLock.request("screen");
        if (cancelled) {
          await lock.release();
          return;
        }
        wakeLockRef.current = lock;
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      release();
    };
  }, [anyRunning]);

  const fabReadout = (() => {
    if (intervalRunning)
      return { text: fmtMMSS(intervalRemaining), color: phaseColor(phase) };
    if (cdRunning) return { text: fmtMMSS(cdRemaining), color: "#f59e0b" };
    if (amrapRunning) return { text: fmtMMSS(amrapRemaining), color: "#a855f7" };
    if (swRunning) return { text: fmtMMSS(swElapsedMs / 1000), color: "#3b82f6" };
    return null;
  })();

  const saveCustomPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = [
      ...customPresets.filter((p) => p.name !== name),
      { name, config: intervalConfig },
    ];
    setCustomPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
    setShowSavePreset(false);
    setPresetName("");
  };
  const deletePreset = (name: string) => {
    const next = customPresets.filter((p) => p.name !== name);
    setCustomPresets(next);
    localStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  };

  return (
    <>
      {!coachOpen && (
      <button
        onClick={() => setOpen(true)}
        aria-label="Open timer"
        className="fixed z-[70] rounded-full shadow-2xl flex items-center justify-center transition-transform active:scale-95"
        style={{
          right: 76,
          bottom: 96,
          width: 48,
          height: 48,
          background: fabReadout ? fabReadout.color : "var(--bg-card)",
          color: fabReadout ? "#0a0a0a" : "var(--fg)",
          border: "1px solid var(--border)",
          boxShadow: "0 10px 30px -8px rgba(0,0,0,0.5)",
        }}
      >
        {fabReadout ? (
          <span
            className="nums text-[12px] font-bold leading-none"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {fabReadout.text}
          </span>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="13" r="8" />
            <path d="M12 9v4l2 2" />
            <path d="M9 2h6" />
          </svg>
        )}
      </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[110] flex flex-col"
          style={{ background: "var(--bg)" }}
        >
          <div
            className="px-4 flex items-center justify-between shrink-0"
            style={{
              paddingTop: "calc(env(safe-area-inset-top) + 12px)",
              paddingBottom: 12,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div>
              <p className="label text-[10px]" style={{ color: "var(--fg-dim)" }}>
                Timer
              </p>
              <h3 className="text-[17px] font-bold tracking-tight">
                {modeLabel(mode)}
              </h3>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
              }}
              aria-label="Close timer"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div
            className="px-3 py-2.5 shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div
              className="flex gap-1 p-1 rounded-xl"
              style={{ background: "var(--bg-elevated)" }}
            >
              {(["INTERVAL", "STOPWATCH", "COUNTDOWN", "AMRAP"] as Mode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 py-2 rounded-lg text-[11px] font-bold tracking-wide transition-colors"
                  style={{
                    background: mode === m ? "var(--bg-card)" : "transparent",
                    color: mode === m ? "var(--fg)" : "var(--fg-dim)",
                    boxShadow: mode === m ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
                  }}
                >
                  {modeShort(m)}
                </button>
              ))}
            </div>
          </div>

          {mode === "INTERVAL" &&
            (intervalRunning || intervalPaused !== null || phase === "DONE" ? (
              <IntervalRun
                phase={phase}
                remaining={intervalRemaining}
                round={round}
                rounds={intervalConfig.rounds}
                paused={intervalPaused !== null}
                onPause={pauseInterval}
                onResume={resumeInterval}
                onReset={resetInterval}
                onSkip={skipPhase}
              />
            ) : (
              <IntervalSetup
                config={intervalConfig}
                setConfig={setIntervalConfig}
                customPresets={customPresets}
                onApplyPreset={(c) => setIntervalConfig(c)}
                onDeletePreset={deletePreset}
                onSavePreset={() => {
                  setPresetName("");
                  setShowSavePreset(true);
                }}
                total={totalIntervalWorkout}
                onStart={startInterval}
              />
            ))}

          {mode === "STOPWATCH" && (
            <StopwatchView
              elapsedMs={swElapsedMs}
              running={swRunning}
              laps={swLaps}
              onStart={startSw}
              onPause={pauseSw}
              onLap={lapSw}
              onReset={resetSw}
            />
          )}

          {mode === "COUNTDOWN" &&
            (cdRunning || cdPaused !== null ? (
              <CountdownRun
                remaining={cdRemaining}
                paused={cdPaused !== null}
                onPause={pauseCd}
                onResume={resumeCd}
                onReset={resetCd}
              />
            ) : (
              <CountdownSetup
                seconds={cdConfigSeconds}
                setSeconds={setCdConfigSeconds}
                onStart={startCd}
              />
            ))}

          {mode === "AMRAP" &&
            (amrapRunning || amrapPaused !== null ? (
              <AmrapRun
                remaining={amrapRemaining}
                rounds={amrapRounds}
                running={amrapRunning}
                paused={amrapPaused !== null}
                onTap={tapRound}
                onPause={pauseAmrap}
                onResume={resumeAmrap}
                onReset={resetAmrap}
              />
            ) : (
              <AmrapSetup
                seconds={amrapConfigSeconds}
                setSeconds={setAmrapConfigSeconds}
                onStart={startAmrap}
              />
            ))}
        </div>
      )}

      {showSavePreset && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => setShowSavePreset(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card w-full max-w-sm p-5"
            style={{ background: "var(--bg-card)" }}
          >
            <p className="label">Preset</p>
            <h3 className="text-[17px] font-bold tracking-tight mt-0.5 mb-3">
              Save current settings
            </h3>
            <input
              autoFocus
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g. My finisher"
              className="w-full rounded-xl px-3 py-2.5 text-[14px] focus:outline-none mb-3"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowSavePreset(false)}
                className="btn-ghost px-4 py-2.5 rounded-xl text-[13px]"
              >
                Cancel
              </button>
              <button
                onClick={saveCustomPreset}
                disabled={!presetName.trim()}
                className="btn-accent flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function modeLabel(m: Mode) {
  switch (m) {
    case "INTERVAL":
      return "Interval";
    case "STOPWATCH":
      return "Stopwatch";
    case "COUNTDOWN":
      return "Countdown";
    case "AMRAP":
      return "AMRAP";
  }
}
function modeShort(m: Mode) {
  switch (m) {
    case "INTERVAL":
      return "INTERVAL";
    case "STOPWATCH":
      return "STOPWATCH";
    case "COUNTDOWN":
      return "TIMER";
    case "AMRAP":
      return "AMRAP";
  }
}

function phaseColor(phase: Phase) {
  return phase === "WORK"
    ? "#22c55e"
    : phase === "REST"
    ? "#f59e0b"
    : phase === "PREP"
    ? "#3b82f6"
    : phase === "DONE"
    ? "#a855f7"
    : "#737373";
}

function IntervalSetup({
  config,
  setConfig,
  customPresets,
  onApplyPreset,
  onDeletePreset,
  onSavePreset,
  total,
  onStart,
}: {
  config: IntervalConfig;
  setConfig: (c: IntervalConfig) => void;
  customPresets: { name: string; config: IntervalConfig }[];
  onApplyPreset: (c: IntervalConfig) => void;
  onDeletePreset: (name: string) => void;
  onSavePreset: () => void;
  total: number;
  onStart: () => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
      <div>
        <p className="label mb-2">Presets</p>
        <div className="flex flex-wrap gap-2">
          {BUILT_IN_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => onApplyPreset(p.config)}
              className="px-3 py-2 rounded-xl text-[12px] font-semibold"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
                border: "1px solid var(--border)",
              }}
            >
              {p.name}
            </button>
          ))}
        </div>
        {customPresets.length > 0 && (
          <>
            <p className="label mt-4 mb-2">Saved</p>
            <div className="flex flex-wrap gap-2">
              {customPresets.map((p) => (
                <div
                  key={p.name}
                  className="rounded-xl flex items-stretch overflow-hidden"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <button
                    onClick={() => onApplyPreset(p.config)}
                    className="px-3 py-2 text-[12px] font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => onDeletePreset(p.name)}
                    className="px-2"
                    style={{
                      color: "var(--fg-dim)",
                      borderLeft: "1px solid var(--border)",
                    }}
                    aria-label={`Delete ${p.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="Work (sec)"
          value={config.workSeconds}
          onChange={(v) => setConfig({ ...config, workSeconds: v })}
        />
        <NumField
          label="Rest (sec)"
          value={config.restSeconds}
          onChange={(v) => setConfig({ ...config, restSeconds: v })}
        />
        <NumField
          label="Rounds"
          value={config.rounds}
          onChange={(v) => setConfig({ ...config, rounds: v })}
          min={1}
        />
        <NumField
          label="Get-ready (sec)"
          value={config.prepSeconds}
          onChange={(v) => setConfig({ ...config, prepSeconds: v })}
        />
      </div>

      <div
        className="card p-4 flex items-center justify-between"
        style={{ background: "var(--bg-card)" }}
      >
        <div>
          <p className="label text-[10px]" style={{ color: "var(--fg-dim)" }}>
            Total
          </p>
          <p
            className="nums text-[22px] font-bold mt-0.5"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {fmtMMSS(total)}
          </p>
        </div>
        <button
          onClick={onSavePreset}
          className="px-3 py-2 rounded-xl text-[11px] font-semibold label"
          style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
        >
          Save preset
        </button>
      </div>

      <button
        onClick={onStart}
        disabled={config.workSeconds <= 0 || config.rounds <= 0}
        className="btn-accent w-full py-4 rounded-2xl text-[15px] font-bold tracking-tight"
      >
        Start
      </button>
    </div>
  );
}

function IntervalRun({
  phase,
  remaining,
  round,
  rounds,
  paused,
  onPause,
  onResume,
  onReset,
  onSkip,
}: {
  phase: Phase;
  remaining: number;
  round: number;
  rounds: number;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSkip: () => void;
}) {
  const color = phaseColor(phase);
  const label =
    phase === "WORK"
      ? "WORK"
      : phase === "REST"
      ? "REST"
      : phase === "PREP"
      ? "GET READY"
      : phase === "DONE"
      ? "DONE"
      : "";
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
      <p
        className="label text-[11px] mb-2"
        style={{ color, letterSpacing: "0.2em" }}
      >
        {label}
      </p>
      <BigClock text={fmtMMSS(remaining)} color={color} />
      <p className="text-[14px] mt-4" style={{ color: "var(--fg-muted)" }}>
        Round{" "}
        <span className="nums font-bold" style={{ color: "var(--fg)" }}>
          {round}
        </span>{" "}
        / {rounds}
      </p>
      <div className="mt-8 flex items-center gap-3">
        <CtrlBtn label="Reset" onClick={onReset} />
        {paused ? (
          <CtrlBtn label="Resume" onClick={onResume} accent />
        ) : (
          <CtrlBtn label="Pause" onClick={onPause} accent />
        )}
        <CtrlBtn label="Skip" onClick={onSkip} />
      </div>
    </div>
  );
}

function StopwatchView({
  elapsedMs,
  running,
  laps,
  onStart,
  onPause,
  onLap,
  onReset,
}: {
  elapsedMs: number;
  running: boolean;
  laps: number[];
  onStart: () => void;
  onPause: () => void;
  onLap: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col px-4 py-6">
      <div className="flex flex-col items-center justify-center pt-8 pb-6">
        <p
          className="label text-[11px] mb-2"
          style={{ color: "#3b82f6", letterSpacing: "0.2em" }}
        >
          ELAPSED
        </p>
        <BigClock text={fmtMMSSCC(elapsedMs)} color="#3b82f6" tabular />
      </div>
      <div className="flex items-center justify-center gap-3 mb-5">
        <CtrlBtn label="Reset" onClick={onReset} />
        {running ? (
          <CtrlBtn label="Pause" onClick={onPause} accent />
        ) : (
          <CtrlBtn
            label={elapsedMs > 0 ? "Resume" : "Start"}
            onClick={onStart}
            accent
          />
        )}
        <CtrlBtn label="Lap" onClick={onLap} />
      </div>
      {laps.length > 0 && (
        <div
          className="flex-1 overflow-y-auto rounded-2xl p-3"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="label mb-2" style={{ color: "var(--fg-dim)" }}>
            Laps
          </p>
          <div className="space-y-1">
            {laps
              .map((total, i) => {
                const split = i === 0 ? total : total - laps[i - 1];
                return { i: i + 1, total, split };
              })
              .reverse()
              .map(({ i, total, split }) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 px-2"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <span
                    className="nums text-[11px] font-semibold w-8"
                    style={{
                      color: "var(--fg-dim)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {String(i).padStart(2, "0")}
                  </span>
                  <span
                    className="nums text-[13px] flex-1 text-right"
                    style={{
                      color: "var(--fg-muted)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    +{fmtMMSSCC(split)}
                  </span>
                  <span
                    className="nums text-[14px] font-bold w-24 text-right"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {fmtMMSSCC(total)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CountdownSetup({
  seconds,
  setSeconds,
  onStart,
}: {
  seconds: number;
  setSeconds: (s: number) => void;
  onStart: () => void;
}) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
      <p
        className="label text-[12px] text-center"
        style={{ color: "var(--fg-dim)" }}
      >
        One-shot timer with audio cue at zero
      </p>
      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="Minutes"
          value={m}
          onChange={(v) => setSeconds(v * 60 + s)}
        />
        <NumField
          label="Seconds"
          value={s}
          onChange={(v) => setSeconds(m * 60 + Math.min(59, v))}
        />
      </div>
      <div>
        <p className="label mb-2">Quick pick</p>
        <div className="flex flex-wrap gap-2">
          {[60, 90, 120, 180, 300, 600, 900, 1200].map((p) => (
            <button
              key={p}
              onClick={() => setSeconds(p)}
              className="px-3 py-2 rounded-xl text-[12px] font-semibold nums"
              style={{
                background:
                  p === seconds ? "var(--accent-dim)" : "var(--bg-elevated)",
                color: p === seconds ? "var(--accent)" : "var(--fg-muted)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {fmtMMSS(p)}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={seconds <= 0}
        className="btn-accent w-full py-4 rounded-2xl text-[15px] font-bold tracking-tight"
      >
        Start
      </button>
    </div>
  );
}

function CountdownRun({
  remaining,
  paused,
  onPause,
  onResume,
  onReset,
}: {
  remaining: number;
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
      <p
        className="label text-[11px] mb-2"
        style={{ color: "#f59e0b", letterSpacing: "0.2em" }}
      >
        COUNTDOWN
      </p>
      <BigClock text={fmtMMSS(remaining)} color="#f59e0b" />
      <div className="mt-8 flex items-center gap-3">
        <CtrlBtn label="Reset" onClick={onReset} />
        {paused ? (
          <CtrlBtn label="Resume" onClick={onResume} accent />
        ) : (
          <CtrlBtn label="Pause" onClick={onPause} accent />
        )}
      </div>
    </div>
  );
}

function AmrapSetup({
  seconds,
  setSeconds,
  onStart,
}: {
  seconds: number;
  setSeconds: (s: number) => void;
  onStart: () => void;
}) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-5">
      <p
        className="label text-[12px] text-center"
        style={{ color: "var(--fg-dim)" }}
      >
        As Many Rounds As Possible — tap to count rounds while time runs down
      </p>
      <div className="grid grid-cols-2 gap-3">
        <NumField
          label="Minutes"
          value={m}
          onChange={(v) => setSeconds(v * 60 + s)}
        />
        <NumField
          label="Seconds"
          value={s}
          onChange={(v) => setSeconds(m * 60 + Math.min(59, v))}
        />
      </div>
      <div>
        <p className="label mb-2">Quick pick</p>
        <div className="flex flex-wrap gap-2">
          {[300, 600, 720, 900, 1200, 1500, 1800].map((p) => (
            <button
              key={p}
              onClick={() => setSeconds(p)}
              className="px-3 py-2 rounded-xl text-[12px] font-semibold nums"
              style={{
                background:
                  p === seconds ? "var(--accent-dim)" : "var(--bg-elevated)",
                color: p === seconds ? "var(--accent)" : "var(--fg-muted)",
                border: "1px solid var(--border)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {fmtMMSS(p)}
            </button>
          ))}
        </div>
      </div>
      <button
        onClick={onStart}
        disabled={seconds <= 0}
        className="btn-accent w-full py-4 rounded-2xl text-[15px] font-bold tracking-tight"
      >
        Start
      </button>
    </div>
  );
}

function AmrapRun({
  remaining,
  rounds,
  running,
  paused,
  onTap,
  onPause,
  onResume,
  onReset,
}: {
  remaining: number;
  rounds: number;
  running: boolean;
  paused: boolean;
  onTap: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col px-4 py-6">
      <div className="flex flex-col items-center pt-4 pb-2">
        <p
          className="label text-[11px] mb-1"
          style={{ color: "#a855f7", letterSpacing: "0.2em" }}
        >
          AMRAP
        </p>
        <p
          className="nums font-bold leading-none"
          style={{
            color: "#a855f7",
            fontSize: "min(20vw, 110px)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {fmtMMSS(remaining)}
        </p>
      </div>
      <button
        onClick={onTap}
        disabled={!running}
        className="flex-1 mx-2 my-4 rounded-3xl flex flex-col items-center justify-center active:scale-[0.98] transition-transform disabled:opacity-50"
        style={{
          background: "var(--accent-dim)",
          border: "2px solid var(--accent)",
          color: "var(--accent)",
        }}
      >
        <span
          className="nums font-bold leading-none"
          style={{
            fontSize: "min(28vw, 150px)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {rounds}
        </span>
        <span className="label text-[11px] mt-3">
          {running ? "TAP FOR ROUND" : paused ? "PAUSED" : "DONE"}
        </span>
      </button>
      <div className="flex items-center justify-center gap-3 pb-2">
        <CtrlBtn label="Reset" onClick={onReset} />
        {paused ? (
          <CtrlBtn label="Resume" onClick={onResume} accent />
        ) : (
          <CtrlBtn label="Pause" onClick={onPause} accent />
        )}
      </div>
    </div>
  );
}

function BigClock({
  text,
  color,
  tabular,
}: {
  text: string;
  color: string;
  tabular?: boolean;
}) {
  // Scale viewport-width so the longer "M:SS.cc" stopwatch text fits on
  // narrow screens without clipping at the edges.
  const vw = text.length >= 7 ? 16 : text.length >= 6 ? 19 : 24;
  const cap = text.length >= 7 ? 110 : text.length >= 6 ? 130 : 160;
  return (
    <p
      className="nums font-bold leading-none text-center w-full px-4"
      style={{
        color,
        fontSize: `min(${vw}vw, ${cap}px)`,
        fontFamily: "var(--font-geist-mono)",
        fontVariantNumeric: tabular ? "tabular-nums" : undefined,
      }}
    >
      {text}
    </p>
  );
}

function NumField({
  label,
  value,
  onChange,
  min = 0,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
}) {
  return (
    <label className="block">
      <p className="label text-[10px] mb-1" style={{ color: "var(--fg-dim)" }}>
        {label}
      </p>
      <input
        type="number"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n) && n >= min) onChange(n);
          else if (e.target.value === "") onChange(min);
        }}
        className="w-full text-center text-[18px] rounded-xl py-3 focus:outline-none nums"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
          fontFamily: "var(--font-geist-mono)",
        }}
      />
    </label>
  );
}

function CtrlBtn({
  label,
  onClick,
  accent,
}: {
  label: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="px-5 py-3 rounded-2xl text-[13px] font-bold tracking-tight active:scale-95 transition-transform"
      style={{
        background: accent ? "var(--accent)" : "var(--bg-card)",
        color: accent ? "#0a0a0a" : "var(--fg)",
        border: accent ? "none" : "1px solid var(--border)",
        minWidth: 92,
      }}
    >
      {label}
    </button>
  );
}
