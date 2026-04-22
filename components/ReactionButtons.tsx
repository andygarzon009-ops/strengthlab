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
    <div className="flex gap-2 flex-wrap">
      {REACTION_TYPES.map((rt) => {
        const count = reactions.filter((r) => r.type === rt.value).length;
        const hasReacted = reactions.some(
          (r) => r.type === rt.value && r.userId === currentUserId
        );
        return (
          <button
            key={rt.value}
            onClick={() => handleReaction(rt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all active:scale-95 ${
              hasReacted
                ? "bg-orange-500/20 text-orange-400 border border-orange-500/30"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 border border-transparent"
            }`}
          >
            <span>{rt.emoji}</span>
            <span>{rt.label}</span>
            {count > 0 && (
              <span className={`ml-0.5 ${hasReacted ? "text-orange-300" : "text-zinc-500"}`}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
