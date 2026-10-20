// Is a live (clock-running) workout in progress on this device?
//
// The workout form mirrors its draft to localStorage under sl:workoutDraft;
// once "Begin workout" (or the warm-up) starts the clock, that draft carries a
// startedAt. The bottom nav reads this so its center button can take the
// athlete straight back to the session from any tab.

const DRAFT_KEY = "sl:workoutDraft";
// A clock left running from yesterday isn't a session anyone is in; past this
// the button goes back to offering something new (the draft itself stays).
const STALE_MS = 12 * 60 * 60 * 1000;

export function hasLiveWorkout(): boolean {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw) as { startedAt?: unknown };
    if (typeof d.startedAt !== "string") return false;
    const t = Date.parse(d.startedAt);
    return Number.isFinite(t) && Date.now() - t < STALE_MS;
  } catch {
    return false;
  }
}
