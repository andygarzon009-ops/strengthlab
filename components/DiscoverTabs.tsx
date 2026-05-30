"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
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
export type OnFireRow = {
  id: string;
  name: string;
  image: string | null;
  streak: number;
  sessions: number;
};
export type MilestoneItem = {
  id: string;
  emoji: string;
  title: string;
  subtitle: string;
  score: number;
};
export type ExploreItem = {
  id: string;
  name: string;
  image: string | null;
  mutuals: number;
};

type TabKey = "leaderboard" | "highlights" | "challenges" | "you";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function DiscoverTabs({
  ranking,
  myRankLabel,
  highlights,
  challenges,
  onFire,
  milestones,
  explore,
}: {
  ranking: RankRow[];
  myRankLabel: string | null;
  highlights: HighlightItem[];
  challenges: ChallengeItem[];
  onFire: OnFireRow[];
  milestones: MilestoneItem[];
  explore: ExploreItem[];
}) {
  // Highlights leads — it's the most visual, aesthetic page.
  const tabs: { key: TabKey; label: string }[] = [
    { key: "highlights", label: "Highlights" },
    { key: "leaderboard", label: "Leaderboard" },
    { key: "challenges", label: "Challenges" },
    { key: "you", label: "For You" },
  ];

  // Restore the active tab from the URL (?tab=) so returning here via a back
  // button lands on the SAME tab the user left from, not a reset default.
  const searchParams = useSearchParams();
  const validKeys = tabs.map((t) => t.key);
  const urlTab = searchParams.get("tab") as TabKey | null;
  const [active, setActive] = useState<TabKey>(
    urlTab && validKeys.includes(urlTab) ? urlTab : "highlights",
  );

  const selectTab = (key: TabKey) => {
    setActive(key);
    // Reflect the tab in the URL without a navigation/scroll jump.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", key);
      window.history.replaceState(null, "", url.toString());
    }
  };

  // Append the current Crew tab as the return target so any tile we open knows
  // where "back" should go (handled by BackButton's ?from support).
  const backTo = `/group?tab=${active}`;
  const withFrom = (href: string) => {
    if (href.startsWith("#")) return href; // same-page anchors
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}from=${encodeURIComponent(backTo)}`;
  };

  // Highlights tab also surfaces on-fire streaks + milestones as cards.
  const highlightsEmpty =
    highlights.length === 0 && onFire.length === 0 && milestones.length === 0;

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
              onClick={() => selectTab(t.key)}
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
          {highlightsEmpty ? (
            <Empty text="No PRs, streaks, or milestones yet. They show up here as your crew trains." />
          ) : (
            <>
              {/* On-fire streaks */}
              {onFire
                .filter((r) => r.streak >= 2)
                .map((r) => (
                  <StoryTile
                    key={`fire-${r.id}`}
                    href={withFrom(`/u/${r.id}`)}
                    bgImage={r.image}
                    gradient="linear-gradient(160deg, #f97316 0%, #7c2d12 100%)"
                    badge="🔥 On fire"
                    title={r.name}
                    subtitle={`${r.streak}-day streak · ${r.sessions} this week`}
                  />
                ))}

              {/* PRs (cheerable) */}
              {highlights.map((h) => (
                <StoryTile
                  key={h.id}
                  href={withFrom(`/workout/${h.workoutId}`)}
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
              ))}

              {/* Milestones */}
              {milestones.map((m) => (
                <StoryTile
                  key={m.id}
                  href={withFrom("/consistency")}
                  gradient="linear-gradient(160deg, #a3e635 0%, #14532d 100%)"
                  badge={`${m.emoji} Milestone`}
                  title={m.title}
                  subtitle={m.subtitle}
                />
              ))}
            </>
          )}
        </Grid>
      )}

      {active === "challenges" && (
        <Grid>
          {challenges.map((c) => (
            <StoryTile
              key={c.id}
              href={withFrom(`/group/challenges/${c.id}`)}
              gradient="linear-gradient(160deg, #16a34a 0%, #052e16 100%)"
              badge="🏆 Challenge"
              title={c.name}
              subtitle={c.subtitle}
              cta="View"
            />
          ))}
          <StoryTile
            href={withFrom("/group/challenges")}
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
            href={withFrom("/consistency")}
            gradient="linear-gradient(160deg, #3b82f6 0%, #0a0a0a 100%)"
            badge="📈 You"
            title="Your week"
            subtitle="Progress, PRs & projections"
            cta="View"
          />
          <StoryTile
            href={withFrom("/strength")}
            gradient="linear-gradient(160deg, #8b5cf6 0%, #0a0a0a 100%)"
            badge="💪 Strength"
            title="Strength trend"
            subtitle="Your overall strength over time"
            cta="View"
          />
          {/* Opens the AI coach in-place (no /coach route exists). Stays on the
              Crew page and preserves the active tab. */}
          <StoryTile
            href={`/group?coach=1&tab=${active}`}
            gradient="linear-gradient(160deg, #0ea5e9 0%, #0a0a0a 100%)"
            badge="🤖 Coach"
            title="Ask your coach"
            subtitle="AI plans, form tips & questions"
            cta="Chat"
          />
          {/* Explore: people your crew follows */}
          {explore.map((e) => (
            <StoryTile
              key={e.id}
              href={withFrom(`/u/${e.id}`)}
              bgImage={e.image}
              gradient="linear-gradient(160deg, #6366f1 0%, #0a0a0a 100%)"
              badge="Discover"
              title={e.name}
              subtitle={`${e.mutuals} mutual${e.mutuals === 1 ? "" : "s"}`}
              cta="View"
            />
          ))}
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
