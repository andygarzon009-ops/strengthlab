"use client";

import { addReaction } from "@/lib/actions/workouts";
import { REACTION_TYPES } from "@/lib/exercises";
import { useTransition } from "react";

type Reaction = { id: string; userId: string; type: string };

export default function ReactionButtons({
  workoutId,
  reactions,
  currentUserId,
}: {
  workoutId: string;
  reactions: Reaction[];
  currentUserId: string;
}) {
  const [, startTransition] = useTransition();

  const handleReaction = (type: string) => {
    startTransition(() => addReaction(workoutId, type));
  };

  return (
    <div className="flex gap-1.5 flex-wrap">
      {REACTION_TYPES.map((rt) => {
        const count = reactions.filter((r) => r.type === rt.value).length;
        const hasReacted = reactions.some(
          (r) => r.type === rt.value && r.userId === currentUserId
        );
        return (
          <button
            key={rt.value}
            onClick={() => handleReaction(rt.value)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all active:scale-95"
            style={
              hasReacted
                ? {
                    background: "var(--accent-dim)",
                    color: "var(--accent)",
                    border: "1px solid rgba(255,90,31,0.35)",
                  }
                : {
                    background: "var(--bg-elevated)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            <span className="text-[14px]">{rt.emoji}</span>
            {count > 0 && (
              <span
                className="nums text-[11px]"
                style={{ fontFamily: "var(--font-geist-mono)" }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
