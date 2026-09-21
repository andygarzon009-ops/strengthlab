// Shared between the friend-profile server component (which groups a year of
// workouts by month) and the ProfileCalendar client component (which pages
// through them). It lives here rather than in the component because a plain
// function exported from a "use client" module becomes a client reference —
// calling it during the server render throws.

export type CalendarWorkout = {
  id: string;
  title: string;
  typeLabel: string;
  /** e.g. "42 min", or null when the session had no duration logged. */
  durationLabel: string | null;
};

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-8" for September 2026 — month is 0-indexed, matching Date. */
export function monthKey(year: number, month: number) {
  return `${year}-${month}`;
}
