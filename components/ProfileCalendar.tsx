"use client";

import { useState } from "react";
import Link from "next/link";

// Month calendar on a profile. A trained day used to link straight to ONE
// workout — the most recent of that day — so a double session was invisible
// and the earlier workout unreachable from here. Days with several sessions
// now expand into a list instead, and single-session days keep linking
// straight through so the common case stays one tap.

export type CalendarWorkout = {
  id: string;
  title: string;
  typeLabel: string;
  /** e.g. "42 min", or null when the session had no duration logged. */
  durationLabel: string | null;
};

export default function ProfileCalendar({
  cells,
  workoutsByDay,
  monthLabel,
}: {
  /** Day numbers with leading nulls for the Mon-first offset. */
  cells: (number | null)[];
  /** Day number → that day's workouts, earliest first. */
  workoutsByDay: Record<number, CalendarWorkout[]>;
  monthLabel: string;
}) {
  const [openDay, setOpenDay] = useState<number | null>(null);
  const openList = openDay !== null ? workoutsByDay[openDay] ?? [] : [];

  return (
    <>
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
