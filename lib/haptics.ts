"use client";

/// A single detent tick, for dragging across a chart.
///
/// Two mechanisms, because the obvious one doesn't exist where it's most
/// needed. `navigator.vibrate` covers Android and desktop Chrome; iOS Safari
/// has never implemented it, so on iPhone the chart scrub was silent no
/// matter what we passed it.
///
/// The fallback exploits the one haptic iOS does give a web page: toggling
/// `<input type="checkbox" switch>` — the native iOS switch control, from
/// 17.4 — plays a system tick. Clicking a hidden one produces that tick
/// without showing a control. It's a workaround, not an API, and it can stop
/// working; it degrades to silence rather than breaking anything.

let hiddenLabel: HTMLLabelElement | null = null;
let hiddenInput: HTMLInputElement | null = null;
let nativeWorks: boolean | null = null;

/// Floor between ticks. A fast drag crosses dozens of readings in a frame, and
/// asking the motor for every one queues vibrations faster than it can play
/// them — on Android that backs up and drags the whole gesture with it. At
/// 30ms the detents still feel continuous.
const MIN_TICK_GAP_MS = 30;
let lastTickAt = 0;

function ensureSwitch(): void {
  if (hiddenLabel || typeof document === "undefined") return;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  // Must stay in the layout tree — display:none or visibility:hidden stops
  // iOS treating it as a real control, and the tick goes with it.
  label.style.cssText =
    "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;" +
    "pointer-events:none;overflow:hidden;z-index:-1;";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  hiddenLabel = label;
  hiddenInput = input;
}

/** True when this browser exposes the Vibration API at all. */
export function hasVibrationApi(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

/**
 * One short tick. Safe to call rapidly — it's what a drag does per reading.
 *
 * `durationMs` only applies to the native path; the iOS fallback plays a
 * fixed system tick and can't be tuned.
 */
export function hapticTick(durationMs = 10): void {
  if (typeof window === "undefined") return;

  const now = Date.now();
  if (now - lastTickAt < MIN_TICK_GAP_MS) return;
  lastTickAt = now;

  // Native first. vibrate() returns false when the request was rejected, so
  // remember that and stop asking.
  if (nativeWorks !== false && hasVibrationApi()) {
    try {
      const ok = navigator.vibrate?.(durationMs);
      if (ok) {
        nativeWorks = true;
        return;
      }
      nativeWorks = false;
    } catch {
      nativeWorks = false;
    }
  }

  // iOS: borrow the switch control's system haptic.
  try {
    ensureSwitch();
    hiddenLabel?.click();
  } catch {
    // No haptic available. Nothing else a page can do.
  }
}

/** Longer pattern for one-off events (rest finished), not for dragging. */
export function hapticPattern(pattern: number[]): void {
  if (typeof window === "undefined") return;
  if (hasVibrationApi()) {
    try {
      if (navigator.vibrate?.(pattern)) return;
    } catch {
      // fall through
    }
  }
  // Approximate a pattern with repeated ticks, since the iOS fallback has
  // exactly one flavour. Kept short — this is a cue, not an alarm.
  try {
    ensureSwitch();
    const beats = Math.min(3, Math.ceil(pattern.length / 2));
    for (let i = 0; i < beats; i++) {
      window.setTimeout(() => hiddenLabel?.click(), i * 130);
    }
  } catch {
    // ignore
  }
}
