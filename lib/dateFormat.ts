/// Server components run in UTC on Vercel — date-fns format() therefore
/// renders timestamps in UTC, which shifts late-evening local workouts to the
/// next calendar day. These helpers format in the user's stored timezone.

type FormatOptions = Intl.DateTimeFormatOptions;

function fmt(date: Date | string, timezone: string | null | undefined, options: FormatOptions) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone ?? "UTC",
    ...options,
  }).format(new Date(date));
}

/// "Wednesday, May 27, 2026"
export function formatLongDate(date: Date | string, timezone: string | null | undefined) {
  return fmt(date, timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/// "Wed · May 27"
export function formatShortDate(date: Date | string, timezone: string | null | undefined) {
  const weekday = fmt(date, timezone, { weekday: "short" });
  const monthDay = fmt(date, timezone, { month: "short", day: "numeric" });
  return `${weekday} · ${monthDay}`;
}

/// "2026-05-27" — calendar-day key in the user's timezone. Used for grouping
/// workouts onto specific days in lists / calendar tiles.
export function formatDateKey(date: Date | string, timezone: string | null | undefined) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(date));
  const y = parts.find((p) => p.type === "year")?.value ?? "";
  const m = parts.find((p) => p.type === "month")?.value ?? "";
  const d = parts.find((p) => p.type === "day")?.value ?? "";
  return `${y}-${m}-${d}`;
}
