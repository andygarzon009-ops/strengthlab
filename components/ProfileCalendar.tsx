"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MONTHS,
  monthKey,
  type CalendarWorkout,
} from "@/lib/profileCalendar";

// Month calendar on a profile. A trained day used to link straight to ONE
// workout — the most recent of that day — so a double session was invisible
// and the earlier workout unreachable from here. Days with several sessions
// now expand into a list instead, and single-session days keep linking
// straight through so the common case stays one tap.
//
// The calendar also steps back through months: the profile page already loads
// a year of sessions, so paging is pure client state — no refetch, no URL.


export default function ProfileCalendar({
  year,
  month,
  earliestYear,
  earliestMonth,
  workoutsByMonth,
  today,
}: {
  /** Month shown first — normally the current one. */
  year: number;
  month: number;
  /** Day of the month that is today in `year`/`month`, outlined. */
  today?: number;
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
  const isCurrent = view.year === year && view.month === month;
  const sessionCount = Object.values(workoutsByDay).reduce((n, l) => n + l.length, 0);

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="min-w-0">
          <h2 className="text-[16px] font-bold tracking-tight leading-tight">
            {monthLabel} <span style={{ color: "var(--fg-muted)", fontWeight: 600 }}>{view.year}</span>
          </h2>
          <p className="text-[11px] mt-0.5 tabular-nums" style={{ color: "var(--fg-muted)" }}>
            {sessionCount === 0
              ? "No sessions"
              : `${sessionCount} session${sessionCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <MonthArrow
            dir="prev"
            disabled={!canGoBack}
            label={`Previous month${canGoBack ? "" : " — no earlier sessions loaded"}`}
            onClick={() => step(-1)}
          />
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
            className="text-center text-[10px] font-semibold uppercase pb-1"
            style={{ color: "var(--fg-muted)" }}
          >
            {d}
          </div>
        ))}

        {cells.map((day, i) => {
          const list = day !== null ? workoutsByDay[day] ?? [] : [];
          const isOpen = day !== null && day === openDay;

          if (day === null) {
            return <div key={i} className="h-10" />;
          }

          const isToday = isCurrent && day === today;
          const base =
            "relative h-10 rounded-xl flex items-center justify-center text-[13px] tabular-nums";
          const trained = {
            background: "rgba(74,222,128,0.18)",
            color: "#bbf7d0",
            fontWeight: 700,
            boxShadow: isToday ? "inset 0 0 0 1.5px #a3e635" : undefined,
          } as const;

          if (list.length === 0) {
            return (
              <div
                key={i}
                className={base}
                style={{
                  color: isToday ? "var(--fg)" : "var(--fg-dim)",
                  fontWeight: isToday ? 700 : 400,
                  boxShadow: isToday ? "inset 0 0 0 1.5px var(--border-strong)" : undefined,
                }}
              >
                {day}
              </div>
            );
          }
          if (list.length === 1) {
            return (
              <Link
                key={i}
                href={`/workout/${list[0].id}`}
                aria-label={`View workout on ${monthLabel} ${day}`}
                className={`${base} active:scale-95 transition-transform`}
                style={trained}
              >
                {day}
              </Link>
            );
          }
          // Several sessions: tapping opens the list rather than guessing
          // which one they meant. Brighter fill and a dot per session make it
          // obvious there's more than one before you tap.
          return (
            <button
              key={i}
              type="button"
              onClick={() => setOpenDay(isOpen ? null : day)}
              aria-expanded={isOpen}
              aria-label={`${list.length} workouts on ${monthLabel} ${day} — show all`}
              className={`${base} active:scale-95 transition-transform`}
              style={{
                ...trained,
                background: isOpen ? "#a3e635" : "rgba(74,222,128,0.34)",
                color: isOpen ? "#0a0a0a" : "#dcfce7",
              }}
            >
              {day}
              <span className="absolute bottom-1 flex gap-[2px]" aria-hidden>
                {Array.from({ length: Math.min(3, list.length) }, (_, k) => (
                  <span
                    key={k}
                    className="w-[3px] h-[3px] rounded-full"
                    style={{ background: isOpen ? "#0a0a0a" : "#a3e635" }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      {openDay !== null && openList.length > 0 && (
        <div
          className="mt-3 rounded-2xl overflow-hidden"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
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
