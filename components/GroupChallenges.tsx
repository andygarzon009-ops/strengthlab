"use client";

import { useEffect, useState } from "react";

type Member = {
  user: { id: string; name: string };
  weekSessions: number;
  weekVolume: number;
};

type PR = {
  userId: string;
  userName: string;
  exerciseName: string;
  weight: number;
  reps: number;
  date: string;
};

export default function GroupChallenges({ members }: { members: Member[] }) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [prs, setPRs] = useState<PR[]>([]);

  // We don't actually have the group id in props; parent renders us inside the card.
  // Pull the card's data-group-id from the parent. Simplest: just fetch challenges for any group
  // by looking at the closest ancestor — but easier: do it in the parent. Instead, derive from URL hash.
  // Skipping — parent will pass id via data attribute. For simplicity, require parent to pass it.

  void groupId;
  void setGroupId;
  void prs;
  void setPRs;

  const topSessions = [...members]
    .sort((a, b) => b.weekSessions - a.weekSessions || b.weekVolume - a.weekVolume)
    .slice(0, 3);
  const topSessionCount = topSessions[0]?.weekSessions ?? 0;

  if (topSessionCount === 0) return null;

  return (
    <div className="mb-3">
      <p
        className="label text-[9px] mb-2"
        style={{ color: "var(--fg-dim)" }}
      >
        This week's challenge
      </p>
      <div
        className="rounded-xl p-3"
        style={{
          background:
            "linear-gradient(135deg, rgba(34,197,94,0.08) 0%, var(--bg-elevated) 70%)",
          border: "1px solid rgba(34,197,94,0.25)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[16px]">🏆</span>
          <p className="text-[12px] font-semibold">
            Most sessions this week
          </p>
        </div>
        <div className="space-y-1.5">
          {topSessions.map((m, i) => {
            const isLeader = i === 0;
            const pct =
              topSessionCount > 0
                ? (m.weekSessions / topSessionCount) * 100
                : 0;
            return (
              <div key={m.user.id}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="flex items-center gap-1.5">
                    <span
                      style={{
                        color: isLeader ? "var(--accent)" : "var(--fg-muted)",
                      }}
                    >
                      {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                    </span>
                    <span className="font-medium">{m.user.name}</span>
                  </span>
                  <span
                    className="nums"
                    style={{
                      fontFamily: "var(--font-geist-mono)",
                      color: isLeader ? "var(--accent)" : "var(--fg-dim)",
                    }}
                  >
                    {m.weekSessions}
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-card)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: isLeader
                        ? "var(--accent)"
                        : "var(--fg-dim)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Optional: render biggest PRs block when groupId is provided
export function GroupChallengePRs({ groupId }: { groupId: string }) {
  const [prs, setPRs] = useState<PR[]>([]);

  useEffect(() => {
    fetch(`/api/groups/${groupId}/challenges`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.biggestPRs) setPRs(d.biggestPRs);
      })
      .catch(() => {});
  }, [groupId]);

  if (prs.length === 0) return null;

  return (
    <div className="mb-3">
      <p
        className="label text-[9px] mb-2"
        style={{ color: "var(--fg-dim)" }}
      >
        Biggest PRs this week
      </p>
      <div
        className="rounded-xl p-3 space-y-1.5"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
        }}
      >
        {prs.slice(0, 3).map((pr, i) => (
          <div
            key={`${pr.userId}-${pr.exerciseName}-${pr.date}`}
            className="flex items-center justify-between text-[12px]"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span style={{ color: "var(--accent)" }}>
                {i === 0 ? "🏋️" : "💪"}
              </span>
              <span className="font-medium truncate">{pr.userName}</span>
              <span
                className="truncate"
                style={{ color: "var(--fg-muted)" }}
              >
                — {pr.exerciseName}
              </span>
            </span>
            <span
              className="nums shrink-0 font-semibold"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--accent)",
              }}
            >
              {pr.weight}
              <span className="text-[10px] font-normal opacity-70 ml-0.5">
                lb × {pr.reps}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
