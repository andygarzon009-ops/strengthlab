"use client";

import { addReaction } from "@/lib/actions/workouts";
import { REACTION_TYPES } from "@/lib/exercises";
import { useTransition } from "react";

type Reaction = { id: string; userId: string; type: string };

function ReactionIcon({
  name,
  color,
  active,
}: {
  name: string;
  color: string;
  active: boolean;
}) {
  const stroke = active ? color : `${color}`;
  const fill = active ? color : "none";
  const common = {
    width: 15,
    height: 15,
    viewBox: "0 0 24 24",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill,
    style: { opacity: active ? 1 : 0.85 },
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
    case "thumbsup":
      return (
        <svg {...common}>
          <path d="M7 10v11h10a2 2 0 0 0 2-1.7l1.2-7A2 2 0 0 0 18.2 10H14V5a2 2 0 0 0-2-2l-3 7v0Z" />
          <path d="M3 10h4v11H3z" />
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
        const color = rt.color;
        return (
          <button
            key={rt.value}
            onClick={() => handleReaction(rt.value)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium transition-all active:scale-95 label"
            style={
              hasReacted
                ? {
                    background: `${color}22`,
                    color,
                    border: `1px solid ${color}66`,
                  }
                : {
                    background: "var(--bg-elevated)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                  }
            }
          >
            <ReactionIcon name={rt.icon} color={color} active={hasReacted} />
            <span>{rt.label}</span>
            {count > 0 && (
              <span
                className="nums text-[11px]"
                style={{
                  fontFamily: "var(--font-geist-mono)",
                  color: hasReacted ? color : "var(--fg-dim)",
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
