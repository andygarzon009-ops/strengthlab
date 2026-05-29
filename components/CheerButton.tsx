"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReaction } from "@/lib/actions/workouts";

/// One-tap cheer on a crew member's highlight. A cheer is a 🏆 reaction on
/// the underlying workout, so it reuses the existing reactions system and
/// shows up on the workout's feed card too.
export default function CheerButton({
  workoutId,
  initialCheered,
  initialCount,
}: {
  workoutId: string;
  initialCheered: boolean;
  initialCount: number;
}) {
  const router = useRouter();
  const [cheered, setCheered] = useState(initialCheered);
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !cheered;
    setCheered(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    startTransition(async () => {
      await addReaction(workoutId, "🏆");
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      className="shrink-0 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors disabled:opacity-60"
      style={
        cheered
          ? {
              background: "var(--accent-dim)",
              border: "1px solid rgba(34,197,94,0.35)",
              color: "var(--accent)",
            }
          : {
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }
      }
    >
      🏆 {cheered ? "Cheered" : "Cheer"}
      {count > 0 ? ` · ${count}` : ""}
    </button>
  );
}
