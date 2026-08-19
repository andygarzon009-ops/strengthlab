// Shared audio engine for the app's countdown timers — the rest timer, the
// guided warm-up, and the guided stretch player. Centralized so the two hard
// mobile problems get solved in one place:
//
//   1. SILENT MODE. On iOS, Web Audio is muted by the hardware ring/silent
//      switch by default — which is exactly how a phone sits at the gym, so
//      the beeps "don't work." Declaring the audio session as "playback"
//      (Safari 16.4+) makes our tones play THROUGH the mute switch, like a
//      music or video app. This is the main fix.
//
//   2. BACKGROUND / SCREEN LOCK. Browsers suspend the AudioContext when the
//      tab is backgrounded or the screen locks, after which every tone is
//      silent. Two mitigations: callers hold a screen Wake Lock (keeps the
//      page foregrounded with the screen on), and we keep a looping silent
//      audio element playing so the audio session stays "active" and survives
//      brief backgrounding. Neither can fully guarantee audio after a long
//      manual lock/app-switch the way a native app can — that's a web
//      platform limit, not a bug.
//
//   3. INTERRUPTIONS, AND THE RING SWITCH IN PARTICULAR. Flipping the hardware
//      ring/silent switch interrupts the iOS audio session: the AudioContext
//      goes to "interrupted" (WebKit's own state, outside the spec's enum) and
//      the keep-alive element is paused. Flipping the switch BACK fires no
//      event at all — nothing tells the page the interruption ended — so an
//      accidental off-and-on leaves every later beep silent, with the timer
//      still counting down and looking perfectly fine. Calls, alarms, Siri and
//      another app grabbing audio end the same way.
//
//      Events can't carry this, so a watchdog does: while a timer is armed we
//      check once a second that the context is running and the keep-alive is
//      still playing, and repair it when it isn't. resume() needs no fresh
//      gesture here because starting the timer was one and sticky activation
//      outlives the interruption. A context that refuses to come back after
//      several tries is closed and rebuilt, which is the only cure for the
//      interruptions WebKit won't resume from.
//
// Everything here is client-only and no-ops during SSR.

let ctx: AudioContext | null = null;
let keepAliveEl: HTMLAudioElement | null = null;
let keepAliveUrl: string | null = null;

// True between unlockAudio() and releaseAudio() — i.e. while a timer is
// actually running and expects to be able to beep. The watchdog only runs, and
// only repairs, while this is set, so nothing polls once the session is over.
let armed = false;
let watchdogId: number | null = null;
// Consecutive seconds spent unhealthy. WebKit sometimes leaves a context
// interrupted past the point resume() can help, and rebuilding is the only
// cure — but a long interruption (an actual phone call) is NOT that case, and
// tearing down a context every few seconds through a ten-minute call would
// churn for nothing. So: cheap repairs every tick, a rebuild only after a
// sustained failure, and a hard cap on rebuilds per armed session. When the
// interruption really does end, the cheap resume is what catches it.
let unhealthySeconds = 0;
let rebuilds = 0;
const REBUILD_AFTER_SECONDS = 10;
const MAX_REBUILDS = 3;

// WebKit reports "interrupted", which isn't in the spec's AudioContextState.
function isRunning(c: AudioContext | null): boolean {
  return !!c && (c.state as string) === "running";
}

// Everything the beeps depend on: a running context, and — if we managed to
// build one — a keep-alive that is still playing rather than paused by an
// interruption.
function audioHealthy(): boolean {
  if (!isRunning(ctx)) return false;
  if (keepAliveEl && keepAliveEl.paused) return false;
  return true;
}

// One repair attempt. Cheap and idempotent: re-assert the playback session,
// resume the context, restart the keep-alive. Any of the three may be the
// broken one, and after a ring-switch toggle it is usually all three.
function repairAudio(): void {
  setPlaybackSession();
  try {
    if (ctx && !isRunning(ctx)) void ctx.resume().catch(() => {});
  } catch {
    // ignore — the watchdog tries again next tick
  }
  try {
    if (keepAliveEl?.paused) void keepAliveEl.play().catch(() => {});
  } catch {
    // ignore
  }
}

// Drop the context and build a fresh one. The last resort for an interruption
// WebKit will not resume out of — a new context starts clean, and the gesture
// that started the timer still counts as activation for resuming it.
function rebuildContext(): void {
  const dead = ctx;
  ctx = null;
  unhealthySeconds = 0;
  rebuilds++;
  try {
    void dead?.close().catch(() => {});
  } catch {
    // ignore — we've already let go of the reference
  }
  createContext();
}

function createContext(): void {
  try {
    type W = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as W).webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      // An interruption is the one state change worth reacting to instantly
      // rather than waiting up to a second for the watchdog.
      ctx.addEventListener?.("statechange", () => {
        if (armed && !audioHealthy()) repairAudio();
      });
    }
    if (!isRunning(ctx)) void ctx.resume().catch(() => {});
  } catch {
    // ignore — tone() will retry lazily
  }
}

function startWatchdog(): void {
  if (watchdogId != null || typeof window === "undefined") return;
  watchdogId = window.setInterval(() => {
    if (!armed) return;
    if (audioHealthy()) {
      unhealthySeconds = 0;
      return;
    }
    unhealthySeconds++;
    if (unhealthySeconds >= REBUILD_AFTER_SECONDS && rebuilds < MAX_REBUILDS) {
      rebuildContext();
    }
    repairAudio();
  }, 1000);
}

function stopWatchdog(): void {
  if (watchdogId == null) return;
  clearInterval(watchdogId);
  watchdogId = null;
  unhealthySeconds = 0;
  rebuilds = 0;
}

// Tell iOS this is playback audio so it ignores the mute switch. Cheap and
// idempotent — safe to call on every unlock/resume.
function setPlaybackSession(): void {
  try {
    const s = (navigator as unknown as { audioSession?: { type: string } })
      .audioSession;
    if (s && s.type !== "playback") s.type = "playback";
  } catch {
    // Unsupported browser — nothing to do; foreground audio still works.
  }
}

// Build a short silent WAV as a blob URL, generated at runtime so we don't
// ship an audio asset. Looped, this keeps the media/audio session alive for
// background survival without making any sound.
function makeSilentLoopUrl(): string | null {
  try {
    const sampleRate = 8000;
    const samples = sampleRate; // 1s of silence
    const bytes = 44 + samples * 2;
    const buf = new ArrayBuffer(bytes);
    const view = new DataView(buf);
    const writeStr = (off: number, s: string) => {
      for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true); // PCM chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeStr(36, "data");
    view.setUint32(40, samples * 2, true);
    // sample bytes are already zero → silence
    const blob = new Blob([view], { type: "audio/wav" });
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

// Call from a user gesture (a Start / Resume tap). Creates + resumes the
// AudioContext, sets the playback session, and starts the silent keep-alive.
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  armed = true;
  setPlaybackSession();
  createContext();
  try {
    if (!keepAliveEl) {
      keepAliveUrl = makeSilentLoopUrl();
      if (keepAliveUrl) {
        keepAliveEl = new Audio(keepAliveUrl);
        keepAliveEl.loop = true;
        keepAliveEl.setAttribute("playsinline", "");
        // An interruption pauses this element, and the ring switch coming back
        // on won't unpause it. The watchdog would catch it within a second;
        // this catches it immediately, and costs nothing when the pause was
        // our own releaseAudio() (armed is false by then).
        keepAliveEl.addEventListener("pause", () => {
          if (armed) repairAudio();
        });
      }
    }
    void keepAliveEl?.play().catch(() => {});
  } catch {
    // ignore — keep-alive is best-effort
  }
  startWatchdog();
}

// Call when the app returns to the foreground (visibility/focus) to re-arm
// audio the browser suspended while backgrounded.
export function resumeAudio(): void {
  if (typeof window === "undefined") return;
  repairAudio();
  if (armed) startWatchdog();
}

// Stop the keep-alive when a session ends (done / exit) so we're not holding
// the audio session and battery once the timer is over.
export function releaseAudio(): void {
  armed = false;
  stopWatchdog();
  try {
    keepAliveEl?.pause();
  } catch {
    // ignore
  }
}

// Emit a sine-wave beep. Lazily unlocks if a cue fires before any gesture did.
export function tone(freq: number, durationMs: number, gainPeak = 0.25): void {
  if (typeof window === "undefined") return;
  // "interrupted" — the state a ring-switch flip leaves behind — is not
  // "suspended", so checking for suspended alone let silent beeps through.
  // Prime rather than unlock: a one-off beep (the rest-end chime) should get a
  // working context and the playback session without arming the watchdog, which
  // belongs to a running timer and is stopped by that timer's releaseAudio.
  if (!isRunning(ctx)) {
    setPlaybackSession();
    createContext();
    if (armed) repairAudio();
  }
  if (!ctx) return;
  try {
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
  } catch {
    // ignore — a failed tone shouldn't break the countdown loop
  }
}

export function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      navigator.vibrate?.(pattern);
    } catch {
      // unsupported or blocked
    }
  }
}
