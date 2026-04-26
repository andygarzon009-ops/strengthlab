"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const CONFIG_KEY = "strengthlab.intervalTimer.config.v1";
const PRESETS_KEY = "strengthlab.intervalTimer.presets.v1";

type Phase = "IDLE" | "PREP" | "WORK" | "REST" | "DONE";

type Config = {
  workSeconds: number;
  restSeconds: number;
  rounds: number;
  prepSeconds: number;
};

const DEFAULT_CONFIG: Config = {
  workSeconds: 40,
  restSeconds: 20,
  rounds: 8,
  prepSeconds: 5,
};

const BUILT_IN_PRESETS: { name: string; config: Config }[] = [
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

const vibrate = (pattern: number | number[]) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(pattern);
  }
};

const fmt = (s: number) => {
  const total = Math.max(0, Math.ceil(s));
  const m = Math.floor(total / 60);
  const r = total % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
};

const readConfig = (): Config => {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
};

const readPresets = (): { name: string; config: Config }[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

export default function IntervalTimer() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [phase, setPhase] = useState<Phase>("IDLE");
  const [round, setRound] = useState(1);
  const [phaseEndsAt, setPhaseEndsAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [customPresets, setCustomPresets] = useState<{ name: string; config: Config }[]>([]);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");
  const lastBeepSecondRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Hydrate config + presets.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConfig(readConfig());
    setCustomPresets(readPresets());
  }, []);

  // Persist config when changed.
  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  }, [config]);

  // Tick.
  const running = phase !== "IDLE" && phase !== "DONE" && pausedRemaining === null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [running]);

  const remaining = (() => {
    if (pausedRemaining !== null) return pausedRemaining;
    if (phaseEndsAt === null) return 0;
    return Math.max(0, (phaseEndsAt - now) / 1000);
  })();

  const startPhase = useCallback(
    (next: Phase) => {
      const seconds =
        next === "PREP"
          ? config.prepSeconds
          : next === "WORK"
          ? config.workSeconds
          : next === "REST"
          ? config.restSeconds
          : 0;
      setPhase(next);
      setPhaseEndsAt(seconds > 0 ? Date.now() + seconds * 1000 : null);
      lastBeepSecondRef.current = null;
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
    [config]
  );

  // Phase transitions when remaining hits 0.
  useEffect(() => {
    if (!running) return;
    if (remaining > 0) return;
    if (phase === "PREP") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRound(1);
      startPhase("WORK");
    } else if (phase === "WORK") {
      if (round >= config.rounds) {
        startPhase("DONE");
      } else if (config.restSeconds <= 0) {
        // EMOM-style: no rest, advance straight to next round.
        setRound((r) => r + 1);
        startPhase("WORK");
      } else {
        startPhase("REST");
      }
    } else if (phase === "REST") {
      setRound((r) => r + 1);
      startPhase("WORK");
    }
  }, [remaining, phase, round, config, running, startPhase]);

  // Last-3-second countdown beeps.
  useEffect(() => {
    if (!running) return;
    const sec = Math.ceil(remaining);
    if (sec > 0 && sec <= 3 && lastBeepSecondRef.current !== sec) {
      lastBeepSecondRef.current = sec;
      cueCountdown();
    }
  }, [remaining, running, phase]);

  // Wake lock while running.
  useEffect(() => {
    const release = async () => {
      try {
        await wakeLockRef.current?.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
    };
    if (!running) {
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
  }, [running]);

  const start = () => {
    ensureAudio(); // prime audio context within the user gesture
    setRound(1);
    startPhase(config.prepSeconds > 0 ? "PREP" : "WORK");
  };

  const pause = () => {
    if (phaseEndsAt === null) return;
    const r = (phaseEndsAt - Date.now()) / 1000;
    setPausedRemaining(Math.max(0, r));
    setPhaseEndsAt(null);
  };

  const resume = () => {
    if (pausedRemaining === null) return;
    setPhaseEndsAt(Date.now() + pausedRemaining * 1000);
    setPausedRemaining(null);
  };

  const reset = () => {
    setPhase("IDLE");
    setRound(1);
    setPhaseEndsAt(null);
    setPausedRemaining(null);
  };

  const skipPhase = () => {
    if (phase === "IDLE" || phase === "DONE") return;
    setPhaseEndsAt(Date.now()); // forces transition on next tick
    setPausedRemaining(null);
    setNow(Date.now());
  };

  const applyPreset = (c: Config) => {
    setConfig(c);
  };

  const saveCustomPreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const next = [
      ...customPresets.filter((p) => p.name !== name),
      { name, config },
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

  const totalWorkout = (() => {
    const cycle = config.workSeconds + config.restSeconds;
    const last = config.workSeconds; // no trailing rest after the final round
    return config.prepSeconds + cycle * (config.rounds - 1) + last;
  })();

  const phaseColor =
    phase === "WORK"
      ? "#22c55e"
      : phase === "REST"
      ? "#f59e0b"
      : phase === "PREP"
      ? "#3b82f6"
      : phase === "DONE"
      ? "#a855f7"
      : "var(--fg-muted)";

  const phaseLabel =
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
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open interval timer"
        className="fixed z-[70] rounded-full shadow-2xl flex items-center justify-center transition-transform active:scale-95"
        style={{
          right: 16,
          bottom: "calc(env(safe-area-inset-bottom) + 88px)",
          width: 52,
          height: 52,
          background: running ? phaseColor : "var(--bg-card)",
          color: running ? "#0a0a0a" : "var(--fg)",
          border: "1px solid var(--border)",
          boxShadow: "0 10px 30px -8px rgba(0,0,0,0.5)",
        }}
      >
        {running ? (
          <span
            className="nums text-[12px] font-bold leading-none"
            style={{ fontFamily: "var(--font-geist-mono)" }}
          >
            {fmt(remaining)}
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
                Interval Timer
              </p>
              <h3 className="text-[17px] font-bold tracking-tight">
                {phase === "IDLE" || phase === "DONE" ? "Set up" : phaseLabel}
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

          {phase === "IDLE" || phase === "DONE" ? (
            <div className="flex-1 overflow-y-auto px-4 py-5 space-y-5">
              <div>
                <p className="label mb-2">Presets</p>
                <div className="flex flex-wrap gap-2">
                  {BUILT_IN_PRESETS.map((p) => (
                    <button
                      key={p.name}
                      onClick={() => applyPreset(p.config)}
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
                            onClick={() => applyPreset(p.config)}
                            className="px-3 py-2 text-[12px] font-semibold"
                            style={{ color: "var(--accent)" }}
                          >
                            {p.name}
                          </button>
                          <button
                            onClick={() => deletePreset(p.name)}
                            className="px-2"
                            style={{ color: "var(--fg-dim)", borderLeft: "1px solid var(--border)" }}
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
                    {fmt(totalWorkout)}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPresetName("");
                    setShowSavePreset(true);
                  }}
                  className="px-3 py-2 rounded-xl text-[11px] font-semibold label"
                  style={{
                    background: "var(--bg-elevated)",
                    color: "var(--fg-muted)",
                  }}
                >
                  Save preset
                </button>
              </div>

              <button
                onClick={start}
                disabled={config.workSeconds <= 0 || config.rounds <= 0}
                className="btn-accent w-full py-4 rounded-2xl text-[15px] font-bold tracking-tight"
              >
                Start
              </button>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center px-4 py-6">
              <p
                className="label text-[11px] mb-2"
                style={{ color: phaseColor, letterSpacing: "0.2em" }}
              >
                {phaseLabel}
              </p>
              <p
                className="nums font-bold leading-none"
                style={{
                  color: phaseColor,
                  fontSize: "min(34vw, 180px)",
                  fontFamily: "var(--font-geist-mono)",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmt(remaining)}
              </p>
              <p
                className="text-[14px] mt-4"
                style={{ color: "var(--fg-muted)" }}
              >
                Round{" "}
                <span className="nums font-bold" style={{ color: "var(--fg)" }}>
                  {round}
                </span>{" "}
                / {config.rounds}
              </p>

              <div className="mt-8 flex items-center gap-3">
                <CtrlBtn label="Reset" onClick={reset} />
                {pausedRemaining !== null ? (
                  <CtrlBtn label="Resume" onClick={resume} accent />
                ) : (
                  <CtrlBtn label="Pause" onClick={pause} accent />
                )}
                <CtrlBtn label="Skip" onClick={skipPhase} />
              </div>
            </div>
          )}
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
