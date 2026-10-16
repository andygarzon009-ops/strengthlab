"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import StoryTile from "@/components/StoryTile";
import CheerButton from "@/components/CheerButton";
import Avatar from "@/components/Avatar";

export type RankRow = {
  id: string;
  name: string;
  image: string | null;
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
    { key: "leaderboard", label: "Ranks" },
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
      {/* Tab bar: one segmented control, same as the range chips elsewhere */}
      <div
        className="flex gap-1 p-1 mb-3 rounded-full"
        style={{ background: "var(--bg-elevated)" }}
      >
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectTab(t.key)}
              className="flex-1 text-[12.5px] py-1.5 rounded-full whitespace-nowrap font-semibold transition-colors"
              style={{
                background: on ? "var(--bg-card)" : "transparent",
                color: on ? "var(--fg)" : "var(--fg-muted)",
                boxShadow: on ? "inset 0 0 0 1px var(--border-strong)" : undefined,
              }}
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
            href={withFrom("/strength")}
            gradient="linear-gradient(160deg, #3b82f6 0%, #0a0a0a 100%)"
            badge="📈 You"
            title="Progress"
            subtitle="Strength score, projections & targets"
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
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
    >
      <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
        {text}
      </p>
    </div>
  );
}

const PODIUM = [
  { color: "#facc15", glow: "rgba(250,204,21,0.18)", h: 78 },
  { color: "#cbd5e1", glow: "rgba(203,213,225,0.14)", h: 62 },
  { color: "#f59e0b", glow: "rgba(245,158,11,0.14)", h: 50 },
];

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
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-strong)" }}
      >
        <p className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
          No sessions logged this week yet. Be first.
        </p>
      </div>
    );
  }
  const top = ranking.slice(0, 3).filter((r) => r.sessions > 0);
  // Podium order: 2nd, 1st, 3rd.
  const order = [1, 0, 2].filter((i) => i < top.length);
  const max = Math.max(1, ...ranking.map((r) => r.sessions));
  return (
    <div
      className="rounded-3xl p-4"
      style={{
        background:
          "radial-gradient(120% 70% at 50% 0%, rgba(250,204,21,0.1) 0%, transparent 60%), var(--bg-card)",
        border: "1px solid var(--border-strong)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[15px] font-bold tracking-tight">This week</p>
        {myRankLabel && (
          <p className="text-[12px] font-semibold" style={{ color: "var(--fg-muted)" }}>
            {myRankLabel}
          </p>
        )}
      </div>

      {/* podium */}
      <div className="flex items-end justify-center gap-3 mt-4">
        {order.map((i) => {
          const r = top[i];
          const p = PODIUM[i];
          return (
            <div key={r.id} className="flex flex-col items-center" style={{ width: 92 }}>
              <span className="text-[18px] leading-none mb-1">{MEDAL[i]}</span>
              <Avatar
                name={r.name}
                image={r.image}
                size={i === 0 ? 60 : 48}
                ring={`linear-gradient(135deg, ${p.color}, ${p.color}88)`}
              />
              <p className="text-[12px] font-semibold mt-1.5 truncate w-full text-center">
                {r.isYou ? "You" : r.name.split(" ")[0]}
              </p>
              <div
                className="w-full mt-1.5 rounded-t-xl flex flex-col items-center justify-start pt-1.5"
                style={{
                  height: p.h,
                  background: `linear-gradient(180deg, ${p.glow}, transparent)`,
                  borderTop: `2px solid ${p.color}`,
                }}
              >
                <span className="text-[16px] font-bold tabular-nums leading-none">{r.sessions}</span>
                <span className="text-[10px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
                  {r.volumeLabel}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* everyone off the podium */}
      <div className="mt-3 flex flex-col gap-1.5">
        {ranking.slice(top.length).map((r, j) => {
          const i = j + top.length;
          return (
          <div
            key={r.id}
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{
              background: r.isYou ? "rgba(74,222,128,0.1)" : "var(--bg-elevated)",
              boxShadow: r.isYou ? "inset 0 0 0 1px rgba(74,222,128,0.35)" : undefined,
            }}
          >
            <span
              className="w-5 text-center text-[13px] font-bold tabular-nums shrink-0"
              style={{ color: i < 3 && r.sessions > 0 ? PODIUM[i].color : "var(--fg-muted)" }}
            >
              {i + 1}
            </span>
            <Avatar name={r.name} image={r.image} size={32} />
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-semibold truncate">{r.name}</span>
                <span className="text-[11px] tabular-nums shrink-0" style={{ color: "var(--fg-muted)" }}>
                  <b className="text-[13px]" style={{ color: "var(--fg)" }}>{r.sessions}</b>{" "}
                  {r.sessions === 1 ? "session" : "sessions"} · {r.volumeLabel}
                </span>
              </div>
              <div className="h-1.5 rounded-full mt-1.5" style={{ background: "var(--bg-card)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(r.sessions / max) * 100}%`,
                    minWidth: r.sessions ? 6 : 0,
                    background: r.isYou ? "#4ade80" : "rgba(74,222,128,0.5)",
                  }}
                />
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
