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
// Everything here is client-only and no-ops during SSR.

let ctx: AudioContext | null = null;
let keepAliveEl: HTMLAudioElement | null = null;
let keepAliveUrl: string | null = null;

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
  setPlaybackSession();
  try {
    type W = Window & { webkitAudioContext?: typeof AudioContext };
    const AC = window.AudioContext ?? (window as W).webkitAudioContext;
    if (AC) {
      if (!ctx) ctx = new AC();
      if (ctx.state === "suspended") void ctx.resume();
    }
  } catch {
    // ignore — tone() will retry lazily
  }
  try {
    if (!keepAliveEl) {
      keepAliveUrl = makeSilentLoopUrl();
      if (keepAliveUrl) {
        keepAliveEl = new Audio(keepAliveUrl);
        keepAliveEl.loop = true;
        keepAliveEl.setAttribute("playsinline", "");
      }
    }
    void keepAliveEl?.play().catch(() => {});
  } catch {
    // ignore — keep-alive is best-effort
  }
}

// Call when the app returns to the foreground (visibility/focus) to re-arm
// audio the browser suspended while backgrounded.
export function resumeAudio(): void {
  if (typeof window === "undefined") return;
  setPlaybackSession();
  try {
    if (ctx && ctx.state === "suspended") void ctx.resume();
  } catch {
    // ignore
  }
  try {
    if (keepAliveEl && keepAliveEl.paused) void keepAliveEl.play().catch(() => {});
  } catch {
    // ignore
  }
}

// Stop the keep-alive when a session ends (done / exit) so we're not holding
// the audio session and battery once the timer is over.
export function releaseAudio(): void {
  try {
    keepAliveEl?.pause();
  } catch {
    // ignore
  }
}

// Emit a sine-wave beep. Lazily unlocks if a cue fires before any gesture did.
export function tone(freq: number, durationMs: number, gainPeak = 0.25): void {
  if (typeof window === "undefined") return;
  if (!ctx || ctx.state === "suspended") unlockAudio();
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
