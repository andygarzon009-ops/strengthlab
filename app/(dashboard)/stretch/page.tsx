"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GuidedStretch from "@/components/GuidedStretch";
import {
  tryParseRoutine,
  DEFAULT_REST_SEC,
  SWITCH_SEC,
  GET_READY_SEC,
  type StretchRoutine,
} from "@/lib/stretchRoutine";
import { readStretchRoutineRaw, clearStretchSession } from "@/lib/stretchSession";
import { TEMPLATES } from "@/lib/mobilityLibrary";

// The coach's "Do this stretching routine" button stashes the routine JSON in
// sessionStorage and navigates over — same handoff pattern as the "Do this
// workout" voice-draft. Reading it on the client avoids threading a big
// payload through the URL. lib/stretchSession owns the keys.
//
// With no routine handed over, the page offers the standing routines from the
// mobility library instead of dead-ending. They don't depend on the coach
// having generated anything, so the good sessions are always one tap away.

function runtimeMinutes(r: StretchRoutine): number {
  const rest = r.restSec ?? DEFAULT_REST_SEC;
  const total = r.stretches.reduce((sum, s) => {
    const perSide = s.side === "both" ? s.durationSec * 2 + SWITCH_SEC : s.durationSec;
    return sum + perSide + rest;
  }, GET_READY_SEC);
  return Math.round(total / 60);
}

export default function StretchPage() {
  const router = useRouter();
  const [routine, setRoutine] = useState<StretchRoutine | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const raw = readStretchRoutineRaw();
    if (raw) setRoutine(tryParseRoutine(raw));
    setReady(true);
  }, []);

  const exit = () => {
    // Deliberate exit — drop the routine AND any resume point, which also
    // flips the bottom nav's button back from "resume stretching" to "train".
    clearStretchSession();
    // Prefer going back to where they were (the coach); fall back to the home
    // dashboard if there's no history to return to.
    if (window.history.length > 1) router.back();
    else router.push("/");
  };

  if (!ready) return null;

  if (!routine) {
    return (
      <div className="min-h-screen px-5 pt-10 pb-16">
        <h1 className="text-[20px] font-bold mb-1">Mobility</h1>
        <p className="text-[13px] mb-6" style={{ color: "var(--fg-muted)" }}>
          Pick a routine, or ask the coach for one built around what’s tight
          today.
        </p>

        <div className="flex flex-col gap-3">
          {TEMPLATES.map((t) => (
            <button
              key={t.slug}
              onClick={() => setRoutine(t.routine)}
              className="w-full rounded-2xl px-4 py-3.5 text-left active:opacity-70"
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[15px] font-semibold">
                  {t.routine.title}
                </span>
                <span
                  className="text-[11px] font-medium shrink-0"
                  style={{ color: "var(--fg-dim)" }}
                >
                  ~{runtimeMinutes(t.routine)} min ·{" "}
                  {t.routine.stretches.length} drills
                </span>
              </div>
              <p
                className="text-[12px] leading-snug"
                style={{ color: "var(--fg-muted)" }}
              >
                {t.framing}
              </p>
            </button>
          ))}
        </div>

        <Link
          href="/"
          className="mt-8 block text-center text-[13px] font-semibold"
          style={{ color: "var(--fg-dim)" }}
        >
          Back to home
        </Link>
      </div>
    );
  }

  return <GuidedStretch routine={routine} onExit={exit} />;
}
