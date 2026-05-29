import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { loadChallengesForUser } from "@/lib/loadChallenges";
import {
  challengeTypeLabel,
  formatScore,
  timeLeft,
} from "@/lib/crewChallenges";
import BackButton from "@/components/BackButton";
import ChallengeCreateSection from "@/components/ChallengeCreateSection";

export const dynamic = "force-dynamic";

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function ChallengesPage() {
  const userId = await requireAuth();

  const [challenges, follows, exercises] = await Promise.all([
    loadChallengesForUser(userId),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { following: { select: { id: true, name: true } } },
    }),
    prisma.exercise.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: userId }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const people = follows.map((f) => f.following);

  const now = Date.now();
  const active = challenges.filter(
    (c) => !c.endsAt || c.endsAt.getTime() > now,
  );
  const past = challenges.filter(
    (c) => c.endsAt && c.endsAt.getTime() <= now,
  );

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <BackButton href="/group" ariaLabel="Back to crew" />
        <div>
          <p className="label">Crew</p>
          <h1 className="text-[22px] font-bold tracking-tight leading-none mt-1">
            Challenges
          </h1>
        </div>
      </div>

      <ChallengeCreateSection people={people} exercises={exercises} />

      {challenges.length === 0 ? (
        <div
          className="rounded-2xl p-6 text-center"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
            No challenges yet. Start one and rope in your crew — volume races,
            session counts, lift races, or streak battles.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <Section title="Active" challenges={active} />
          )}
          {past.length > 0 && <Section title="Ended" challenges={past} dim />}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  challenges,
  dim,
}: {
  title: string;
  challenges: Awaited<ReturnType<typeof loadChallengesForUser>>;
  dim?: boolean;
}) {
  return (
    <div>
      <p
        className="text-[10px] uppercase tracking-wider font-semibold mb-2"
        style={{ color: "var(--fg-dim)" }}
      >
        {title}
      </p>
      <div className="space-y-3" style={dim ? { opacity: 0.7 } : undefined}>
        {challenges.map((c) => (
          <Link
            key={c.id}
            href={`/group/challenges/${c.id}`}
            className="card block p-4 transition-colors"
          >
            <div className="flex items-baseline justify-between mb-2">
              <div className="min-w-0">
                <p className="text-[15px] font-bold tracking-tight truncate">
                  {c.name}
                </p>
                <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                  {challengeTypeLabel(c.type)} · {c.memberCount} in ·{" "}
                  {timeLeft(c.endsAt)}
                </p>
              </div>
              <span style={{ color: "var(--fg-dim)" }}>›</span>
            </div>
            <div className="space-y-1">
              {c.standings.slice(0, 3).map((s, i) => (
                <div
                  key={s.userId}
                  className="flex items-center justify-between text-[12px]"
                >
                  <span
                    className="truncate"
                    style={{
                      color: s.isYou ? "var(--accent)" : "var(--fg)",
                      fontWeight: s.isYou ? 600 : 400,
                    }}
                  >
                    {i < 3 ? MEDAL[i] : `${i + 1}`} {s.name}
                    {s.reachedTarget ? " ✓" : ""}
                  </span>
                  <span
                    className="tabular-nums shrink-0 ml-2"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {formatScore(c.type, s.score)}
                  </span>
                </div>
              ))}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
