"use client";

import { useState } from "react";
import StoryTile from "@/components/StoryTile";
import CheerButton from "@/components/CheerButton";

export type RankRow = {
  id: string;
  name: string;
  isYou: boolean;
  sessions: number;
  volumeLabel: string;
};
export type HighlightItem = {
  id: string;
  who: string;
  image: string | null;
  subtitle: string;
  workoutId: string;
  count: number;
  cheered: boolean;
};
export type ChallengeItem = { id: string; name: string; subtitle: string };

type TabKey = "leaderboard" | "highlights" | "challenges" | "you";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function DiscoverTabs({
  ranking,
  myRankLabel,
  highlights,
  challenges,
}: {
  ranking: RankRow[];
  myRankLabel: string | null;
  highlights: HighlightItem[];
  challenges: ChallengeItem[];
}) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "leaderboard", label: "Leaderboard" },
    { key: "highlights", label: "Highlights" },
    { key: "challenges", label: "Challenges" },
    { key: "you", label: "For You" },
  ];
  const [active, setActive] = useState<TabKey>("leaderboard");

  return (
    <div className="mb-6">
      {/* Tab bar */}
      <div
        className="flex gap-1.5 mb-3 overflow-x-auto -mx-4 px-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className="text-[13px] px-3.5 py-1.5 rounded-full whitespace-nowrap shrink-0 font-semibold transition-colors"
              style={
                on
                  ? { background: "var(--accent)", color: "#0a0a0a" }
                  : {
                      background: "var(--bg-elevated)",
                      color: "var(--fg-dim)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {active === "leaderboard" && (
        <Leaderboard ranking={ranking} myRankLabel={myRankLabel} />
      )}

      {active === "highlights" && (
        <Grid>
          {highlights.length === 0 ? (
            <Empty text="No PRs from your crew yet. Cheers show up here when someone hits one." />
          ) : (
            highlights.map((h) => (
              <StoryTile
                key={h.id}
                href={`/workout/${h.workoutId}`}
                bgImage={h.image}
                gradient="linear-gradient(160deg, #334155 0%, #0a0a0a 100%)"
                badge="🏆 PR"
                title={h.who}
                subtitle={h.subtitle}
                action={
                  <CheerButton
                    workoutId={h.workoutId}
                    initialCheered={h.cheered}
                    initialCount={h.count}
                  />
                }
              />
            ))
          )}
        </Grid>
      )}

      {active === "challenges" && (
        <Grid>
          {challenges.map((c) => (
            <StoryTile
              key={c.id}
              href={`/group/challenges/${c.id}`}
              gradient="linear-gradient(160deg, #16a34a 0%, #052e16 100%)"
              badge="🏆 Challenge"
              title={c.name}
              subtitle={c.subtitle}
              cta="View"
            />
          ))}
          <StoryTile
            href="/group/challenges"
            gradient="linear-gradient(160deg, #16a34a 0%, #052e16 100%)"
            badge="🏆 Challenge"
            title="Start a challenge"
            subtitle="Volume · sessions · lifts · streaks"
            cta="Create"
          />
        </Grid>
      )}

      {active === "you" && (
        <Grid>
          <StoryTile
            href="/consistency"
            gradient="linear-gradient(160deg, #3b82f6 0%, #0a0a0a 100%)"
            badge="📈 You"
            title="Your week"
            subtitle="Progress, PRs & projections"
            cta="View"
          />
          <StoryTile
            href="/strength"
            gradient="linear-gradient(160deg, #8b5cf6 0%, #0a0a0a 100%)"
            badge="💪 Strength"
            title="Strength trend"
            subtitle="Your overall strength over time"
            cta="View"
          />
          <StoryTile
            href="#grow"
            gradient="linear-gradient(160deg, #a3e635 0%, #14532d 100%)"
            badge="Crew"
            title="Grow your crew"
            subtitle="Invite friends to train"
            cta="Share"
          />
        </Grid>
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="col-span-2 rounded-2xl p-5 text-center"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
        {text}
      </p>
    </div>
  );
}

function Leaderboard({
  ranking,
  myRankLabel,
}: {
  ranking: RankRow[];
  myRankLabel: string | null;
}) {
  const anyActivity = ranking.some((r) => r.sessions > 0);
  if (!anyActivity) {
    return (
      <div
        className="rounded-2xl p-5 text-center"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
          No sessions logged this week yet. Be first.
        </p>
      </div>
    );
  }
  return (
    <div>
      {myRankLabel && (
        <p
          className="text-[11px] mb-2 text-right"
          style={{ color: "var(--fg-dim)" }}
        >
          {myRankLabel}
        </p>
      )}
      <div
        className="rounded-2xl divide-y"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {ranking.map((r, i) => (
          <div
            key={r.id}
            className="flex items-center gap-3 px-4 py-3"
            style={r.isYou ? { background: "var(--accent-dim)" } : undefined}
          >
            <span
              className="w-6 text-center text-[13px] font-bold tabular-nums shrink-0"
              style={{ color: i < 3 ? "var(--fg)" : "var(--fg-dim)" }}
            >
              {i < 3 ? MEDAL[i] : i + 1}
            </span>
            <span className="flex-1 min-w-0 text-[14px] font-medium truncate">
              {r.name}
            </span>
            <span className="text-right tabular-nums shrink-0">
              <span className="text-[14px] font-bold">{r.sessions}</span>
              <span className="text-[11px] ml-1" style={{ color: "var(--fg-dim)" }}>
                {r.sessions === 1 ? "session" : "sessions"} · {r.volumeLabel}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
