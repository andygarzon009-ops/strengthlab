"use client";

import { useEffect, useState } from "react";

type StreakTier = {
  days: number;
  emoji: string;
  title: string;
  subtitle: string;
};

const TIERS: StreakTier[] = [
  { days: 3, emoji: "✨", title: "3-day spark", subtitle: "You showed up three days running. That's how it starts." },
  { days: 7, emoji: "🔥", title: "One full week on fire", subtitle: "Seven days, no gaps. This is the habit forming." },
  { days: 14, emoji: "🔥🔥", title: "Two weeks locked in", subtitle: "Most people quit before here. You didn't." },
  { days: 30, emoji: "⚡", title: "30 days — inferno", subtitle: "A full month straight. Your body is adapting now." },
  { days: 60, emoji: "💎", title: "60-day diamond", subtitle: "Consistency at this level is rare. Keep going." },
  { days: 100, emoji: "👑", title: "100 days", subtitle: "You've built something real. Own it." },
  { days: 365, emoji: "🏆", title: "A year", subtitle: "Not a streak — a lifestyle." },
];

const LS_STREAK = "sl:lastCelebratedStreakTier";
const LS_PR = "sl:lastCelebratedPRId";

type Celebration =
  | { kind: "streak"; tier: StreakTier }
  | {
      kind: "pr";
      exerciseName: string;
      weight: number;
      reps: number;
    };

export default function Celebrations() {
  const [queue, setQueue] = useState<Celebration[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/celebrations")
      .then((r) => r.json())
      .then(
        (data: {
          streakDays: number;
          pr: {
            id: string;
            weight: number;
            reps: number;
            exerciseName: string;
            daysOld: number;
          } | null;
        }) => {
          if (cancelled) return;
          const next: Celebration[] = [];

          const seenTier = parseInt(
            localStorage.getItem(LS_STREAK) || "0",
            10
          );
          const earnedTier = TIERS.filter((t) => data.streakDays >= t.days).pop();
          if (earnedTier && earnedTier.days > seenTier) {
            next.push({ kind: "streak", tier: earnedTier });
            localStorage.setItem(LS_STREAK, String(earnedTier.days));
          } else if (earnedTier) {
            // keep in sync if somehow ahead
            localStorage.setItem(LS_STREAK, String(earnedTier.days));
          } else if (data.streakDays === 0) {
            // streak broken — reset so next milestone will fire fresh
            localStorage.setItem(LS_STREAK, "0");
          }

          if (data.pr && data.pr.daysOld <= 1) {
            const seenPR = localStorage.getItem(LS_PR);
            if (seenPR !== data.pr.id) {
              next.push({
                kind: "pr",
                exerciseName: data.pr.exerciseName,
                weight: data.pr.weight,
                reps: data.pr.reps,
              });
              localStorage.setItem(LS_PR, data.pr.id);
            }
          }

          if (next.length) setQueue(next);
        }
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (queue.length === 0) return null;
  const current = queue[0];
  const dismiss = () => setQueue((q) => q.slice(1));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-6"
      style={{
        background: "rgba(0,0,0,0.75)",
        backdropFilter: "blur(8px)",
      }}
      onClick={dismiss}
    >
      <Confetti />
      <div
        onClick={(e) => e.stopPropagation()}
        className="card p-8 max-w-sm w-full text-center animate-slide-up"
        style={{
          border: "1px solid rgba(34,197,94,0.4)",
          background:
            "linear-gradient(180deg, rgba(34,197,94,0.08) 0%, var(--bg-card) 100%)",
          boxShadow: "0 20px 60px rgba(34,197,94,0.2)",
        }}
      >
        {current.kind === "streak" ? (
          <>
            <div className="text-[56px] leading-none mb-4">
              {current.tier.emoji}
            </div>
            <p
              className="label text-[10px] mb-2"
              style={{ color: "var(--accent)" }}
            >
              Streak unlocked
            </p>
            <h2 className="text-[24px] font-bold tracking-tight mb-3">
              {current.tier.title}
            </h2>
            <p
              className="text-[13px] leading-relaxed mb-6"
              style={{ color: "var(--fg-muted)" }}
            >
              {current.tier.subtitle}
            </p>
          </>
        ) : (
          <>
            <div className="text-[56px] leading-none mb-4">🏋️</div>
            <p
              className="label text-[10px] mb-2"
              style={{ color: "var(--accent)" }}
            >
              New personal record
            </p>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">
              {current.exerciseName}
            </h2>
            <p
              className="nums text-[32px] font-bold mb-4"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--accent)",
              }}
            >
              {current.weight}lb × {current.reps}
            </p>
            <p
              className="text-[13px] leading-relaxed mb-6"
              style={{ color: "var(--fg-muted)" }}
            >
              That&apos;s your new benchmark. Everything above this is territory you just opened up.
            </p>
          </>
        )}
        <button
          onClick={dismiss}
          className="btn-accent w-full py-3 rounded-xl text-[14px] font-semibold"
        >
          Keep going
        </button>
      </div>
    </div>
  );
}

function Confetti() {
  const pieces = Array.from({ length: 40 });
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((_, i) => {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.8;
        const duration = 2 + Math.random() * 1.5;
        const size = 6 + Math.random() * 6;
        const rot = Math.random() * 360;
        const colors = ["#22c55e", "#4ade80", "#fbbf24", "#60a5fa", "#f472b6"];
        const color = colors[i % colors.length];
        return (
          <span
            key={i}
            style={{
              position: "absolute",
              top: "-5%",
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
              background: color,
              transform: `rotate(${rot}deg)`,
              borderRadius: "2px",
              animation: `confetti-fall ${duration}s ${delay}s linear forwards`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
