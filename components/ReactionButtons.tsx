"use client";

import { addReaction } from "@/lib/actions/workouts";
import { REACTION_TYPES } from "@/lib/exercises";
import { useTransition } from "react";

type Reaction = { id: string; userId: string; type: string };

function ReactionIcon({ name, active }: { name: string; active: boolean }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: active ? "var(--accent)" : "var(--fg-muted)",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "flame":
      return (
        <svg {...common}>
          <path d="M12 2s4 4 4 8a4 4 0 0 1-8 0c0-1 .5-2 1-3-2 1-3 3-3 6a6 6 0 0 0 12 0c0-5-6-11-6-11Z" />
        </svg>
      );
    case "trophy":
      return (
        <svg {...common}>
          <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
          <path d="M7 6H4a2 2 0 0 0 0 4h3M17 6h3a2 2 0 0 1 0 4h-3" />
          <path d="M10 13h4v4h-4zM8 21h8" />
          <path d="M12 17v4" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
        </svg>
      );
    default:
      return null;
  }
}

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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all active:scale-95 label"
            style={
              hasReacted
                ? {
                    background: "var(--accent-dim)",
                    color: "var(--accent)",
                    border: "1px solid rgba(34,197,94,0.35)",
                  }
                : {
                    background: "var(--bg-elevated)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            <ReactionIcon name={rt.icon} active={hasReacted} />
            <span>{rt.label}</span>
            {count > 0 && (
              <span
                className="nums text-[11px]"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  color: hasReacted ? "var(--accent)" : "var(--fg-dim)",
                }}
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
