// The coach's long view of sleep. Readiness only carries last night, so a
// question like "do I wake up in the middle of the night?" got "I can only
// see last night". When the athlete asks about sleep, the trainer route pulls
// up to ~90 nights from Google Health and hands the coach one line per night
// plus a summary it can reason over.

import { listSleepSince, type SleepNight, type SleepStageSeg } from "@/lib/googleHealth";

const SLEEP_WORDS =
  /\b(sleep|sleeping|slept|asleep|wake|wakes|waking|woke|awake|awakenings?|insomnia|bed ?time|naps?|tired|restless|hypnogram|rem|deep sleep)\b/i;

/// Is this message about sleep? Cheap gate so ordinary chats don't pay for a
/// multi-page Google Health fetch.
export function asksAboutSleep(message: string): boolean {
  return SLEEP_WORDS.test(message);
}

/// How far back the athlete asked to look ("90 days", "3 months", "6 weeks"),
/// clamped to what's worth fetching. Defaults to 90 nights.
export function requestedNights(message: string): number {
  const m = message.match(/(\d{1,3})\s*(day|night|week|month)s?/i);
  if (!m) return 90;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const days = unit === "week" ? n * 7 : unit === "month" ? n * 30 : n;
  return Math.min(180, Math.max(14, days));
}

/// A wake-up worth counting: an awake stretch of at least this long between
/// falling asleep and the final wake. Shorter blips are normal stage shifts.
const WAKE_MIN_SEC = 5 * 60;

type Night = {
  date: string; // local date of waking
  bed: string | null; // local HH:MM
  up: string | null;
  asleepMin: number;
  inBedMin: number;
  awakeMin: number;
  wakeups: number | null; // null when the night has no stage timeline
  longestWakeMin: number | null;
  longestWakeAt: string | null; // local HH:MM
};

const hhmm = (ms: number, offsetSec: number) =>
  new Date(ms + offsetSec * 1000).toISOString().slice(11, 16);

function digestNight(n: SleepNight): Night {
  const off = n.offsetSec;
  const date = new Date(n.end.getTime() + off * 1000).toISOString().slice(0, 10);
  let wakeups: number | null = null;
  let longest = 0;
  let longestAt: number | null = null;
  const stages: SleepStageSeg[] = n.stages ?? [];
  if (stages.length > 0) {
    const sleepSegs = stages.filter((s) => s.type !== "awake");
    const firstSleep = sleepSegs.length ? Math.min(...sleepSegs.map((s) => s.startMs)) : null;
    const lastSleep = sleepSegs.length ? Math.max(...sleepSegs.map((s) => s.endMs)) : null;
    wakeups = 0;
    if (firstSleep != null && lastSleep != null) {
      for (const s of stages) {
        if (s.type !== "awake") continue;
        if (s.startMs <= firstSleep || s.endMs >= lastSleep) continue;
        const sec = (s.endMs - s.startMs) / 1000;
        if (sec < WAKE_MIN_SEC) continue;
        wakeups++;
        if (sec > longest) {
          longest = sec;
          longestAt = s.startMs;
        }
      }
    }
  }
  return {
    date,
    bed: hhmm(n.start.getTime(), off),
    up: hhmm(n.end.getTime(), off),
    asleepMin: n.asleepMin,
    inBedMin: n.inBedMin,
    awakeMin: n.awakeMin,
    wakeups,
    longestWakeMin: wakeups ? Math.round(longest / 60) : null,
    longestWakeAt: longestAt != null ? hhmm(longestAt, off) : null,
  };
}

const dur = (min: number) => `${Math.floor(min / 60)}h${String(Math.round(min % 60)).padStart(2, "0")}`;
const weekday = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

function render(nights: Night[], asked: number): string {
  const lines = nights.map((n) => {
    const wake =
      n.wakeups == null
        ? "wake-ups n/a (no stage timeline)"
        : n.wakeups === 0
          ? "no wake-ups ≥5m"
          : `${n.wakeups} wake-up${n.wakeups === 1 ? "" : "s"} ≥5m (longest ${n.longestWakeMin}m at ${n.longestWakeAt})`;
    return `${n.date} ${weekday(n.date)}: bed ${n.bed ?? "?"}, up ${n.up ?? "?"}, asleep ${dur(n.asleepMin)}, awake ${n.awakeMin}m, ${wake}`;
  });

  const withStages = nights.filter((n) => n.wakeups != null);
  const woke = withStages.filter((n) => (n.wakeups ?? 0) > 0);
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  // When the wake-ups happen, by local hour — answers "always around 3am?".
  const byHour = new Map<string, number>();
  for (const n of woke) {
    if (!n.longestWakeAt) continue;
    const h = n.longestWakeAt.slice(0, 2);
    byHour.set(h, (byHour.get(h) ?? 0) + 1);
  }
  const hours = [...byHour.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h, c]) => `${h}:00–${h}:59 (${c} nights)`)
    .join(", ");

  const summary = [
    `- Nights with data: ${nights.length} of the last ${asked} (${nights[0]?.date ?? "?"} → ${nights[nights.length - 1]?.date ?? "?"}); nights without the watch are simply missing.`,
    `- Average asleep: ${dur(avg(nights.map((n) => n.asleepMin)))}; average awake time in bed: ${Math.round(avg(nights.map((n) => n.awakeMin)))}m.`,
    withStages.length
      ? `- Woke ≥5 min mid-night on ${woke.length} of ${withStages.length} nights with a stage timeline (${Math.round((woke.length / withStages.length) * 100)}%); average ${avg(withStages.map((n) => n.wakeups ?? 0)).toFixed(1)} such wake-ups a night.`
      : "- No nights carry a stage timeline, so mid-night wake-ups can't be counted — use the awake minutes instead.",
    hours ? `- Longest wake-up usually starts: ${hours}.` : "",
  ].filter(Boolean);

  return `SLEEP HISTORY (Fitbit via Google Health — fetched because the athlete asked about sleep):
${summary.join("\n")}
Per night (local times; "awake" is total awake minutes inside the sleep period):
${lines.join("\n")}
Use this to answer sleep questions directly with numbers — patterns, consistency, typical wake-up times, weekday vs weekend, links to training days. Never say you can only see last night.`;
}

/// Up to `days` nights, newest last, rendered for the prompt. Empty string if
/// Google Health has nothing or doesn't answer in time.
export async function sleepHistoryContext(userId: string, days: number): Promise<string> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const pages = Math.ceil(days / 30) + 1;
  const timeout = new Promise<SleepNight[]>((resolve) => setTimeout(() => resolve([]), 9000));
  const nights = await Promise.race([
    listSleepSince(userId, start.toISOString(), end.toISOString(), pages).catch(() => []),
    timeout,
  ]);
  if (nights.length === 0) return "";
  // One sleep per wake date (the longest), oldest first.
  const byDate = new Map<string, Night>();
  for (const n of nights.map(digestNight)) {
    const prev = byDate.get(n.date);
    if (!prev || n.asleepMin > prev.asleepMin) byDate.set(n.date, n);
  }
  const ordered = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return render(ordered, days);
}
