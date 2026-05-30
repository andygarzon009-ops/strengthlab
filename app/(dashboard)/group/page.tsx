import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { shapeForType } from "@/lib/exercises";
import { loadChallengesForUser } from "@/lib/loadChallenges";
import { timeLeft } from "@/lib/crewChallenges";
import GrowCrew from "@/components/GrowCrew";
import Avatar from "@/components/Avatar";
import DiscoverTabs, {
  type RankRow,
  type HighlightItem,
  type ChallengeItem,
} from "@/components/DiscoverTabs";

export const dynamic = "force-dynamic";

function ago(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  const day = Math.floor(s / 86_400);
  return day === 1 ? "yesterday" : `${day}d ago`;
}

function fmtVol(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k lb` : `${Math.round(v)} lb`;
}

// Story-style ring: bright gradient if trained today, soft accent within a
// week, no ring when quiet.
function ringFor(last: Date | null): string | undefined {
  if (!last) return undefined;
  const days = Math.floor((Date.now() - last.getTime()) / 86_400_000);
  if (days <= 0) return "linear-gradient(135deg, #22c55e, #a3e635)";
  if (days <= 7) return "rgba(34,197,94,0.45)";
  return undefined;
}

const MEDAL = ["🥇", "🥈", "🥉"];

export default async function CrewPage() {
  const userId = await requireAuth();

  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const followingIds = follows.map((f) => f.followingId);
  const everyoneIds = [userId, ...followingIds];

  const [people, lastByUser, weekWorkouts, challengeViews] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: everyoneIds } },
      select: { id: true, name: true, image: true },
    }),
    prisma.workout.groupBy({
      by: ["userId"],
      where: { userId: { in: everyoneIds } },
      _max: { date: true },
    }),
    prisma.workout.findMany({
      where: {
        userId: { in: everyoneIds },
        date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: {
        userId: true,
        type: true,
        exercises: {
          select: { sets: { select: { type: true, weight: true, reps: true } } },
        },
      },
    }),
    loadChallengesForUser(userId),
  ]);

  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const imageById = new Map(people.map((p) => [p.id, p.image]));
  const lastById = new Map(
    lastByUser.map((r) => [r.userId, r._max.date ?? null]),
  );

  // Per-person weekly sessions + tonnage.
  const stat = new Map<string, { sessions: number; volume: number }>();
  for (const id of everyoneIds) stat.set(id, { sessions: 0, volume: 0 });
  for (const w of weekWorkouts) {
    const s = stat.get(w.userId);
    if (!s) continue;
    s.sessions += 1;
    if (shapeForType(w.type) === "STRENGTH") {
      for (const ex of w.exercises) {
        for (const set of ex.sets) {
          if (set.type === "WARMUP") continue;
          s.volume += (set.weight ?? 0) * (set.reps ?? 0);
        }
      }
    }
  }

  const ranked = everyoneIds
    .map((id) => ({
      id,
      name: id === userId ? "You" : (nameById.get(id) ?? "Athlete"),
      isYou: id === userId,
      sessions: stat.get(id)?.sessions ?? 0,
      volume: stat.get(id)?.volume ?? 0,
    }))
    .sort((a, b) =>
      b.sessions !== a.sessions ? b.sessions - a.sessions : b.volume - a.volume,
    );
  const myRank = ranked.findIndex((r) => r.isYou) + 1;
  const anyActivity = ranked.some((r) => r.sessions > 0);

  const followingPeople = followingIds
    .map((id) => ({
      id,
      name: nameById.get(id) ?? "Athlete",
      last: lastById.get(id) ?? null,
    }))
    .sort((a, b) => (b.last?.getTime() ?? 0) - (a.last?.getTime() ?? 0));

  // Story-style circles: you first, then people you follow (most recent).
  const circles = [
    {
      id: userId,
      name: "You",
      image: imageById.get(userId) ?? null,
      last: lastById.get(userId) ?? null,
    },
    ...followingPeople.map((p) => ({
      id: p.id,
      name: p.name,
      image: imageById.get(p.id) ?? null,
      last: p.last,
    })),
  ];

  // Highlights: recent weight PRs from people you follow, each cheerable.
  const prRows =
    followingIds.length === 0
      ? []
      : await prisma.personalRecord.findMany({
          where: {
            userId: { in: followingIds },
            type: "WEIGHT",
            workoutId: { not: null },
            date: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { date: "desc" },
          take: 6,
          select: {
            id: true,
            value: true,
            reps: true,
            date: true,
            userId: true,
            workoutId: true,
            exercise: { select: { name: true } },
          },
        });
  const prWorkoutIds = prRows
    .map((p) => p.workoutId)
    .filter((w): w is string => !!w);
  const cheerRows =
    prWorkoutIds.length === 0
      ? []
      : await prisma.reaction.findMany({
          where: { workoutId: { in: prWorkoutIds }, type: "🏆" },
          select: { workoutId: true, userId: true },
        });
  const cheerCount = new Map<string, number>();
  const iCheered = new Set<string>();
  for (const r of cheerRows) {
    cheerCount.set(r.workoutId, (cheerCount.get(r.workoutId) ?? 0) + 1);
    if (r.userId === userId) iCheered.add(r.workoutId);
  }
  const highlights: HighlightItem[] = prRows.map((p) => {
    const wid = p.workoutId as string;
    return {
      id: p.id,
      who: nameById.get(p.userId) ?? "Athlete",
      image: imageById.get(p.userId) ?? null,
      subtitle: `PR'd ${p.exercise.name} ${Math.round(p.value)}${
        p.reps ? ` × ${p.reps}` : ""
      } · ${ago(p.date)}`,
      workoutId: wid,
      count: cheerCount.get(wid) ?? 0,
      cheered: iCheered.has(wid),
    };
  });

  // Active challenges → Discover tiles.
  const challenges: ChallengeItem[] = challengeViews
    .filter((c) => !c.endsAt || c.endsAt.getTime() > Date.now())
    .map((c) => {
      const i = c.standings.findIndex((s) => s.isYou);
      const rank = i >= 0 ? `You're #${i + 1}` : `${c.memberCount} in`;
      return { id: c.id, name: c.name, subtitle: `${rank} · ${timeLeft(c.endsAt)}` };
    });

  const ranking: RankRow[] = ranked.map((r) => ({
    id: r.id,
    name: r.name,
    isYou: r.isYou,
    sessions: r.sessions,
    volumeLabel: fmtVol(r.volume),
  }));
  const myRankLabel =
    anyActivity && myRank > 0
      ? `You're #${myRank}${myRank <= 3 ? ` ${MEDAL[myRank - 1]}` : ""}`
      : null;

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="mb-5">
        <p className="label">Crew</p>
        <h1 className="text-[28px] font-bold tracking-tight leading-none mt-1">
          Train together
        </h1>
      </div>

      {/* Story-style circles */}
      <div
        className="flex gap-3 mb-6 overflow-x-auto -mx-4 px-4 pb-1"
        style={{ scrollbarWidth: "none" }}
      >
        {circles.map((c) => (
          <Link
            key={c.id}
            href={`/u/${c.id}`}
            className="flex flex-col items-center gap-1.5 shrink-0"
            style={{ width: 64 }}
          >
            <Avatar name={c.name} image={c.image} size={60} ring={ringFor(c.last)} />
            <span className="text-[11px] truncate w-full text-center">
              {c.name === "You" ? "You" : c.name.split(" ")[0]}
            </span>
          </Link>
        ))}
        <a
          href="#grow"
          className="flex flex-col items-center gap-1.5 shrink-0"
          style={{ width: 64 }}
        >
          <span
            className="rounded-full flex items-center justify-center text-[24px]"
            style={{
              width: 60,
              height: 60,
              background: "var(--bg-elevated)",
              border: "1px dashed var(--border-strong)",
              color: "var(--fg-dim)",
            }}
          >
            +
          </span>
          <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
            Add
          </span>
        </a>
      </div>

      <DiscoverTabs
        ranking={ranking}
        myRankLabel={myRankLabel}
        highlights={highlights}
        challenges={challenges}
      />

      {/* Share + add (collapses once you've followed someone) */}
      <div id="grow" style={{ scrollMarginTop: 16 }}>
        <GrowCrew userId={userId} defaultOpen={followingIds.length === 0} />
      </div>
    </div>
  );
}
