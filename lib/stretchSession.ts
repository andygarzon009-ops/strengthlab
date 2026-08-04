// One place that owns the "is a guided stretch session live?" question.
//
// A running routine lives entirely in sessionStorage: the routine JSON that
// the coach handed off (sl:stretchRoutine) plus the live position the player
// writes as it ticks (sl:stretchProgress). Three separate components care —
// the player, the resume card, and the bottom nav's action button — and they
// were each reaching for the raw keys, so a rename or a missed write silently
// stranded a session.
//
// Everything now goes through here, and every write fires a change event so
// UI outside the player (the nav button) can react the moment a routine starts
// or ends. sessionStorage is per-tab and its native `storage` event does NOT
// fire in the tab that wrote it, so the custom event is the only signal that
// works for same-tab updates.

export const STRETCH_ROUTINE_KEY = "sl:stretchRoutine";
export const STRETCH_PROGRESS_KEY = "sl:stretchProgress";

const CHANGE_EVENT = "sl:stretch-session-change";

function notify() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // ignore — the UI just won't live-update
  }
}

export function readStretchRoutineRaw(): string | null {
  try {
    return sessionStorage.getItem(STRETCH_ROUTINE_KEY);
  } catch {
    return null;
  }
}

export function saveStretchRoutineRaw(json: string) {
  try {
    sessionStorage.setItem(STRETCH_ROUTINE_KEY, json);
  } catch {
    // ignore — the handoff just won't survive a reload
  }
  notify();
}

export function readStretchProgressRaw(): string | null {
  try {
    return sessionStorage.getItem(STRETCH_PROGRESS_KEY);
  } catch {
    return null;
  }
}

export function saveStretchProgressRaw(json: string) {
  try {
    sessionStorage.setItem(STRETCH_PROGRESS_KEY, json);
  } catch {
    // ignore — resume just won't be available
  }
  notify();
}

// Drop the live position but keep the routine, so the overview screen can
// still offer it. Used when a routine finishes or is replayed.
export function clearStretchProgress() {
  try {
    sessionStorage.removeItem(STRETCH_PROGRESS_KEY);
  } catch {
    // ignore
  }
  notify();
}

// The athlete is done with this routine entirely — drop both keys.
export function clearStretchSession() {
  try {
    sessionStorage.removeItem(STRETCH_PROGRESS_KEY);
    sessionStorage.removeItem(STRETCH_ROUTINE_KEY);
  } catch {
    // ignore
  }
  notify();
}

// True only when there's a routine to return to AND a saved position in it —
// i.e. the athlete stepped away mid-session and can pick it back up.
export function hasLiveStretchSession(): boolean {
  if (typeof window === "undefined") return false;
  return !!readStretchProgressRaw() && !!readStretchRoutineRaw();
}

// Subscribe to session start/stop. Returns an unsubscribe function.
export function subscribeStretchSession(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}
