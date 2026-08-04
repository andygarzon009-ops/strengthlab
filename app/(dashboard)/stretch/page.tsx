"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import GuidedStretch from "@/components/GuidedStretch";
import { tryParseRoutine, type StretchRoutine } from "@/lib/stretchRoutine";
import { readStretchRoutineRaw, clearStretchSession } from "@/lib/stretchSession";

// The coach's "Do this stretching routine" button stashes the routine JSON in
// sessionStorage and navigates over — same handoff pattern as the "Do this
// workout" voice-draft. Reading it on the client avoids threading a big
// payload through the URL. lib/stretchSession owns the keys.

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
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center">
        <h1 className="text-[18px] font-bold mb-1">No routine loaded</h1>
        <p className="text-[13px] mb-6" style={{ color: "var(--fg-dim)" }}>
          Ask the coach for a stretching routine, then tap “Do this stretching
          routine.”
        </p>
        <Link
          href="/"
          className="rounded-xl px-5 py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--accent)", color: "#0a0a0a" }}
        >
          Back to home
        </Link>
      </div>
    );
  }

  return <GuidedStretch routine={routine} onExit={exit} />;
}
