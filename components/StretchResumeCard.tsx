"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { tryParseRoutine, type StretchRoutine } from "@/lib/stretchRoutine";
import { readStretchProgressRaw, readStretchRoutineRaw } from "@/lib/stretchSession";

// Surfaces an in-progress guided stretch routine in the History / Log tab so
// the athlete can jump back into the live player — the routine's live state
// lives in sessionStorage (sl:stretchProgress), so this reads it on mount and
// only renders when a session is actually paused mid-way.
export default function StretchResumeCard() {
  const [routine, setRoutine] = useState<StretchRoutine | null>(null);

  useEffect(() => {
    const progress = readStretchProgressRaw();
    const raw = readStretchRoutineRaw();
    if (progress && raw) setRoutine(tryParseRoutine(raw));
  }, []);

  if (!routine) return null;

  return (
    <Link
      href="/stretch"
      className="card p-4 mb-4 flex items-center justify-between gap-3 active:scale-[0.99] transition-transform"
      style={{ border: "1px solid var(--accent-ring)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "var(--accent-dim)" }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            style={{ color: "var(--accent)" }}
            aria-hidden
          >
            <path d="M8 5v14l11-7z" />
          </svg>
        </span>
        <div className="min-w-0">
          <div
            className="text-[10px] font-semibold tracking-[0.12em] uppercase"
            style={{ color: "var(--accent)" }}
          >
            Stretching in progress
          </div>
          <div className="text-[14px] font-semibold truncate">
            {routine.title || "Stretch & Mobility"}
          </div>
        </div>
      </div>
      <span
        className="text-[12px] font-semibold shrink-0 rounded-lg px-3 py-1.5"
        style={{ background: "var(--accent)", color: "#0a0a0a" }}
      >
        Resume
      </span>
    </Link>
  );
}
