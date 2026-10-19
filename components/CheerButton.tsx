"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addReaction } from "@/lib/actions/workouts";

const SPARKS = [0, 45, 90, 135, 180, 225, 270, 315];

/// One-tap cheer on a crew member's highlight. A cheer is a 🏆 reaction on
/// the underlying workout, so it reuses the existing reactions system and
/// shows up on the workout's feed card too. It *looks* like 👏, though — the
/// tile it sits on already carries a 🏆 PR badge.
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
  // Bumped per cheer so the pop and burst replay on every tap.
  const [burst, setBurst] = useState(0);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !cheered;
    setCheered(next);
    setCount((c) => Math.max(0, c + (next ? 1 : -1)));
    if (next) setBurst((b) => b + 1);
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
      aria-pressed={cheered}
      aria-label={cheered ? `Cheered${count ? `, ${count} cheers` : ""}` : `Cheer${count ? `, ${count} cheers` : ""}`}
      className="relative shrink-0"
    >
      <span
        key={burst}
        className={`relative flex items-center gap-1.5 h-8 pl-2.5 ${!cheered && count > 0 ? "pr-1" : "pr-3"} rounded-full text-[12px] font-bold ${burst ? "cheer-pop" : ""}`}
        style={{
          animation: burst ? "cheer-pop 420ms cubic-bezier(.3,1.6,.5,1)" : undefined,
          ...(cheered
            ? {
                // Deeper greens, faint glow — reads as "on" without
                // pulling the eye off the tile.
                background: "linear-gradient(135deg, #84cc16 0%, #22c55e 100%)",
                color: "#0a0a0a",
                boxShadow: "0 0 8px rgba(132,204,22,0.25)",
              }
            : {
                background: "rgba(10,10,10,0.55)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.18)",
                color: "#fff",
              }),
        }}
      >
        <span className="text-[14px] leading-none" aria-hidden>👏</span>
        {/* Once cheered the glow says so — just the count, like a like. */}
        {cheered ? (
          <span className="text-[13px] font-extrabold tabular-nums">{Math.max(1, count)}</span>
        ) : (
          "Cheer"
        )}
        {!cheered && count > 0 && (
          <span
            className="min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-extrabold tabular-nums"
            style={{ background: "rgba(255,255,255,0.16)", color: "#fff" }}
          >
            {count}
          </span>
        )}
      </span>

      {burst > 0 && cheered && (
        <span key={`b${burst}`} className="pointer-events-none absolute left-1/2 top-1/2" aria-hidden>
          {SPARKS.map((a, i) => (
            <span
              key={a}
              className="cheer-spark absolute left-0 top-0 rounded-full"
              style={{
                width: i % 2 ? 4 : 5,
                height: i % 2 ? 4 : 5,
                background: i % 2 ? "#d9f99d" : "#4ade80",
                ["--a" as string]: `${a}deg`,
                animation: "cheer-spark 520ms ease-out forwards",
              }}
            />
          ))}
        </span>
      )}
    </button>
  );
}
