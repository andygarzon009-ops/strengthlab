"use client";

import { useState } from "react";
import Link from "next/link";

// Month calendar on a profile. A trained day used to link straight to ONE
// workout — the most recent of that day — so a double session was invisible
// and the earlier workout unreachable from here. Days with several sessions
// now expand into a list instead, and single-session days keep linking
// straight through so the common case stays one tap.
//
// The calendar also steps back through months: the profile page already loads
// a year of sessions, so paging is pure client state — no refetch, no URL.

export type CalendarWorkout = {
  id: string;
  title: string;
  typeLabel: string;
  /** e.g. "42 min", or null when the session had no duration logged. */
  durationLabel: string | null;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-8" for September 2026 — month is 0-indexed, matching Date. */
export function monthKey(year: number, month: number) {
  return `${year}-${month}`;
}

export default function ProfileCalendar({
  year,
  month,
  earliestYear,
  earliestMonth,
  workoutsByMonth,
}: {
  /** Month shown first — normally the current one. */
  year: number;
  month: number;
  /** Oldest month with loaded data; stepping back stops here. */
  earliestYear: number;
  earliestMonth: number;
  /** monthKey → day number → that day's workouts, earliest first. */
  workoutsByMonth: Record<string, Record<number, CalendarWorkout[]>>;
}) {
  const [view, setView] = useState({ year, month });
  const [openDay, setOpenDay] = useState<number | null>(null);

  const workoutsByDay = workoutsByMonth[monthKey(view.year, view.month)] ?? {};
  const monthLabel = MONTHS[view.month];

  // Months are compared as a single number so the bounds check stays simple.
  const asIndex = (y: number, m: number) => y * 12 + m;
  const canGoBack =
    asIndex(view.year, view.month) > asIndex(earliestYear, earliestMonth);
  const canGoForward = asIndex(view.year, view.month) < asIndex(year, month);

  function step(delta: number) {
    setOpenDay(null);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  // Mon-first leading blanks.
  const firstDow = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const openList = openDay !== null ? workoutsByDay[openDay] ?? [] : [];

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[16px] font-bold tracking-tight">History</h2>
        <div className="flex items-center gap-1">
          <MonthArrow
            dir="prev"
            disabled={!canGoBack}
            label={`Previous month${canGoBack ? "" : " — no earlier sessions loaded"}`}
            onClick={() => step(-1)}
          />
          <span
            className="text-[13px] text-center"
            style={{ color: "var(--fg-dim)", minWidth: 116 }}
          >
            {monthLabel} {view.year}
          </span>
          <MonthArrow
            dir="next"
            disabled={!canGoForward}
            label="Next month"
            onClick={() => step(1)}
          />
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-semibold uppercase"
            style={{ color: "var(--fg-dim)" }}
          >
            {d}
          </div>
        ))}

        {cells.map((day, i) => {
          const list = day !== null ? workoutsByDay[day] ?? [] : [];
          const isOpen = day !== null && day === openDay;

          if (day === null) {
            return <div key={i} className="aspect-square" />;
          }

          const ring = {
            border: "1.5px solid #a3e635",
            color: "var(--fg)",
            fontWeight: 600,
          } as const;

          return (
            <div key={i} className="flex items-center justify-center aspect-square">
              {list.length === 0 ? (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {day}
                </div>
              ) : list.length === 1 ? (
                <Link
                  href={`/workout/${list[0].id}`}
                  aria-label={`View workout on ${monthLabel} ${day}`}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] active:scale-95 transition-transform"
                  style={ring}
                >
                  {day}
                </Link>
              ) : (
                // Several sessions: tapping opens the list rather than guessing
                // which one they meant. The filled ring and count make it
                // obvious there's more than one before you tap.
                <button
                  type="button"
                  onClick={() => setOpenDay(isOpen ? null : day)}
                  aria-expanded={isOpen}
                  aria-label={`${list.length} workouts on ${monthLabel} ${day} — show all`}
                  className="relative w-8 h-8 rounded-full flex items-center justify-center text-[12px] active:scale-95 transition-transform"
                  style={{
                    ...ring,
                    background: isOpen ? "#a3e635" : "rgba(163,230,53,0.16)",
                    color: isOpen ? "#0a0a0a" : "var(--fg)",
                  }}
                >
                  {day}
                  <span
                    className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: "#a3e635", color: "#0a0a0a" }}
                  >
                    {list.length}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(workoutsByDay).length === 0 && (
        <p className="text-[12px] text-center mt-3" style={{ color: "var(--fg-dim)" }}>
          No sessions in {monthLabel}.
        </p>
      )}

      {openDay !== null && openList.length > 0 && (
        <div
          className="mt-3 rounded-2xl overflow-hidden"
          style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        >
          <div
            className="px-4 py-2.5 text-[11px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: "var(--fg-dim)", borderBottom: "1px solid var(--border)" }}
          >
            {monthLabel} {openDay} · {openList.length} workouts
          </div>
          {openList.map((w) => (
            <Link
              key={w.id}
              href={`/workout/${w.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 active:opacity-70"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate">{w.title}</div>
                <div className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  {w.typeLabel}
                  {w.durationLabel ? ` · ${w.durationLabel}` : ""}
                </div>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--fg-dim)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
                aria-hidden
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function MonthArrow({
  dir,
  disabled,
  label,
  onClick,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        opacity: disabled ? 0.3 : 1,
      }}
    >
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--fg)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d={dir === "prev" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}
