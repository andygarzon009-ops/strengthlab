"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const STORAGE_KEY = "strengthlab.restTimer.v1";
const DEFAULT_KEY = "strengthlab.restTimer.defaultSeconds";

type Persisted = {
  endsAt: number | null;
  pausedRemaining: number | null;
  totalSeconds: number;
};

type Ctx = {
  remaining: number;
  total: number;
  active: boolean;
  paused: boolean;
  defaultSeconds: number;
  setDefaultSeconds: (s: number) => void;
  start: (seconds?: number) => void;
  add: (delta: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
};

const RestTimerContext = createContext<Ctx | null>(null);

const readPersisted = (): Persisted | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Persisted;
  } catch {
    return null;
  }
};

const writePersisted = (p: Persisted | null) => {
  if (typeof window === "undefined") return;
  if (!p) localStorage.removeItem(STORAGE_KEY);
  else localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
};

const playBeep = () => {
  try {
    type WindowWithWebkit = Window & { webkitAudioContext?: typeof AudioContext };
    const w = window as WindowWithWebkit;
    const AC = window.AudioContext ?? w.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const beep = (freq: number, when: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0, ctx.currentTime + when);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + when + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + when + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + when);
      osc.stop(ctx.currentTime + when + dur + 0.05);
    };
    beep(880, 0, 0.18);
    beep(1175, 0.22, 0.28);
    setTimeout(() => ctx.close().catch(() => {}), 800);
  } catch {
    // ignore
  }
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.([180, 80, 180]);
  }
};

export function RestTimerProvider({ children }: { children: React.ReactNode }) {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [defaultSeconds, setDefaultSecondsState] = useState(120);
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  // Hydrate from localStorage once. Must run post-mount to avoid SSR mismatch.
  useEffect(() => {
    const p = readPersisted();
    if (p) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEndsAt(p.endsAt);
      setPausedRemaining(p.pausedRemaining);
      setTotal(p.totalSeconds);
    }
    const d = localStorage.getItem(DEFAULT_KEY);
    if (d) {
      const n = parseInt(d, 10);
      if (Number.isFinite(n) && n > 0) setDefaultSecondsState(n);
    }
  }, []);

  // Tick.
  useEffect(() => {
    if (endsAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);

  const remaining = (() => {
    if (pausedRemaining !== null) return pausedRemaining;
    if (endsAt === null) return 0;
    return Math.max(0, Math.ceil((endsAt - now) / 1000));
  })();

  const active = endsAt !== null || pausedRemaining !== null;
  const paused = pausedRemaining !== null;

  // Fire beep + cleanup at zero.
  useEffect(() => {
    if (!active) {
      firedRef.current = false;
      return;
    }
    if (remaining === 0 && !paused && !firedRef.current) {
      firedRef.current = true;
      playBeep();
      setEndsAt(null);
      setPausedRemaining(null);
      setTotal(0);
      writePersisted(null);
    }
  }, [remaining, active, paused]);

  // Screen wake lock while a timer is running.
  useEffect(() => {
    const release = async () => {
      try {
        await wakeLockRef.current?.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
    };
    if (!active || paused) {
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
  }, [active, paused]);

  const persist = useCallback(
    (e: number | null, p: number | null, t: number) => {
      if (e === null && p === null) writePersisted(null);
      else writePersisted({ endsAt: e, pausedRemaining: p, totalSeconds: t });
    },
    []
  );

  const start = useCallback(
    (seconds?: number) => {
      const s = seconds ?? defaultSeconds;
      if (s <= 0) return;
      const e = Date.now() + s * 1000;
      firedRef.current = false;
      setEndsAt(e);
      setPausedRemaining(null);
      setTotal(s);
      setNow(Date.now());
      persist(e, null, s);
    },
    [defaultSeconds, persist]
  );

  const add = useCallback(
    (delta: number) => {
      if (pausedRemaining !== null) {
        const next = Math.max(0, pausedRemaining + delta);
        setPausedRemaining(next);
        setTotal((t) => Math.max(t, next));
        persist(null, next, Math.max(total, next));
        return;
      }
      if (endsAt === null) return;
      const next = endsAt + delta * 1000;
      const newRemaining = Math.max(0, Math.ceil((next - Date.now()) / 1000));
      setEndsAt(next);
      setTotal((t) => Math.max(t, newRemaining));
      persist(next, null, Math.max(total, newRemaining));
    },
    [endsAt, pausedRemaining, total, persist]
  );

  const pause = useCallback(() => {
    if (endsAt === null) return;
    const r = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
    setPausedRemaining(r);
    setEndsAt(null);
    persist(null, r, total);
  }, [endsAt, total, persist]);

  const resume = useCallback(() => {
    if (pausedRemaining === null) return;
    const e = Date.now() + pausedRemaining * 1000;
    setEndsAt(e);
    setPausedRemaining(null);
    setNow(Date.now());
    persist(e, null, total);
  }, [pausedRemaining, total, persist]);

  const skip = useCallback(() => {
    setEndsAt(null);
    setPausedRemaining(null);
    setTotal(0);
    persist(null, null, 0);
  }, [persist]);

  const setDefaultSeconds = useCallback((s: number) => {
    if (!Number.isFinite(s) || s <= 0) return;
    setDefaultSecondsState(s);
    localStorage.setItem(DEFAULT_KEY, String(s));
  }, []);

  return (
    <RestTimerContext.Provider
      value={{
        remaining,
        total,
        active,
        paused,
        defaultSeconds,
        setDefaultSeconds,
        start,
        add,
        pause,
        resume,
        skip,
      }}
    >
      {children}
    </RestTimerContext.Provider>
  );
}

export function useRestTimer(): Ctx {
  const ctx = useContext(RestTimerContext);
  if (!ctx) throw new Error("useRestTimer must be inside <RestTimerProvider>");
  return ctx;
}

export function formatMMSS(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}
