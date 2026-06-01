import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { shapeForType } from "@/lib/exercises";
import { loadChallengesForUser } from "@/lib/loadChallenges";
import { timeLeft } from "@/lib/crewChallenges";
import GrowCrew from "@/components/GrowCrew";
import PullToRefresh from "@/components/PullToRefresh";
import Avatar from "@/components/Avatar";
import FriendRequests, { type IncomingRequest } from "@/components/FriendRequests";
import DiscoverTabs, {
  type RankRow,
  type HighlightItem,
  type ChallengeItem,
  type OnFireRow,
  type MilestoneItem,
  type ExploreItem,
} from "@/components/DiscoverTabs";

// Current consecutive-day streak ending today/yesterday, from ISO day keys.
function streakFromDayKeys(dayKeys: string[]): number {
  if (dayKeys.length === 0) return 0;
  const days = [...new Set(dayKeys)].sort();
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const last = days[days.length - 1];
  if (last !== today && last !== yest) return 0;
  let s = 1;
  for (let i = days.length - 2; i >= 0; i--) {
    const diff =
      (new Date(days[i + 1]).getTime() - new Date(days[i]).getTime()) /
      86_400_000;
    if (Math.round(diff) === 1) s++;
    else break;
  }
  return s;
}

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

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const fiveWeeksAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);

  // One parallel batch for every query that only depends on the follow graph.
  // These previously ran as ~6 sequential round-trips, which dominated this
  // page's latency on the Supabase pooler.
  const [
    people,
    lastByUser,
    weekWorkouts,
    challengeViews,
    incomingRaw,
    prRows,
    streakRows,
    totals,
    fofRows,
  ] = await Promise.all([
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
        date: { gte: weekAgo },
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
    prisma.friendRequest.findMany({
      where: { toUserId: userId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { from: { select: { id: true, name: true, image: true } } },
    }),
    followingIds.length === 0
      ? Promise.resolve([])
      : prisma.personalRecord.findMany({
          where: {
            userId: { in: followingIds },
            type: "WEIGHT",
            workoutId: { not: null },
            date: { gte: twoWeeksAgo },
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
        }),
    prisma.workout.findMany({
      where: {
        userId: { in: everyoneIds },
        date: { gte: fiveWeeksAgo },
      },
      select: { userId: true, date: true },
    }),
    prisma.workout.groupBy({
      by: ["userId"],
      where: { userId: { in: everyoneIds } },
      _count: { _all: true },
    }),
    followingIds.length === 0
      ? Promise.resolve([])
      : prisma.follow.findMany({
          where: {
            followerId: { in: followingIds },
            followingId: { notIn: everyoneIds },
          },
          select: { followingId: true },
        }),
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

  // Incoming friend requests (pending) → inbox. (incomingRaw from batch 1)
  const incoming: IncomingRequest[] = incomingRaw.map((r) => ({
    fromUserId: r.from.id,
    name: r.from.name,
    image: r.from.image,
  }));

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

  // prRows + fofRows came from the parallel batch above. The only queries that
  // depend on earlier results — cheers on those PRs, and the explore candidate
  // profiles — run together as one more batch.
  const prWorkoutIds = prRows
    .map((p) => p.workoutId)
    .filter((w): w is string => !!w);
  const mutualCount = new Map<string, number>();
  for (const f of fofRows) {
    mutualCount.set(f.followingId, (mutualCount.get(f.followingId) ?? 0) + 1);
  }
  const candidateIds = [...mutualCount.keys()];

  const [cheerRows, fofUsers] = await Promise.all([
    prWorkoutIds.length === 0
      ? Promise.resolve([])
      : prisma.reaction.findMany({
          where: { workoutId: { in: prWorkoutIds }, type: "🏆" },
          select: { workoutId: true, userId: true },
        }),
    candidateIds.length === 0
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: { id: { in: candidateIds } },
          select: { id: true, name: true, image: true },
        }),
  ]);

  // Highlights: recent weight PRs from people you follow, each cheerable.
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

  // ---- On Fire: current streaks across the crew (streakRows from batch 1) ----
  const daysByUser = new Map<string, string[]>();
  for (const r of streakRows) {
    const arr = daysByUser.get(r.userId) ?? [];
    arr.push(r.date.toISOString().slice(0, 10));
    daysByUser.set(r.userId, arr);
  }
  const onFire: OnFireRow[] = everyoneIds
    .map((id) => ({
      id,
      name: id === userId ? "You" : (nameById.get(id) ?? "Athlete"),
      image: imageById.get(id) ?? null,
      streak: streakFromDayKeys(daysByUser.get(id) ?? []),
      sessions: stat.get(id)?.sessions ?? 0,
    }))
    .filter((r) => r.streak > 0 || r.sessions > 0)
    .sort((a, b) =>
      b.streak !== a.streak ? b.streak - a.streak : b.sessions - a.sessions,
    );

  // ---- Milestones: lifetime workout counts → level + round-number badges ----
  // (totals from batch 1)
  const totalByUser = new Map(totals.map((t) => [t.userId, t._count._all]));
  const milestones: MilestoneItem[] = [];
  for (const id of everyoneIds) {
    const name = id === userId ? "You" : (nameById.get(id) ?? "Athlete");
    const total = totalByUser.get(id) ?? 0;
    const level = Math.floor(total / 10) + 1;
    const streak = streakFromDayKeys(daysByUser.get(id) ?? []);
    if (total >= 10) {
      milestones.push({
        id: `lvl-${id}`,
        emoji: "⚡",
        title: id === userId ? `You're Level ${level}` : `${name} · Level ${level}`,
        subtitle: `${total} workouts logged`,
        score: level * 1000 + total,
      });
    }
    if (streak >= 3) {
      milestones.push({
        id: `streak-${id}`,
        emoji: "🔥",
        title: `${name} · ${streak}-day streak`,
        subtitle: "On a roll this week",
        score: streak,
      });
    }
  }
  milestones.sort((a, b) => b.score - a.score);

  // ---- Explore: friends-of-friends you don't follow yet ----
  // fofUsers + mutualCount were resolved in the batch above.
  const explore: ExploreItem[] = fofUsers
    .map((u) => ({
      id: u.id,
      name: u.name,
      image: u.image,
      mutuals: mutualCount.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.mutuals - a.mutuals)
    .slice(0, 8);

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
    <PullToRefresh>
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

      <FriendRequests requests={incoming} />

      <DiscoverTabs
        ranking={ranking}
        myRankLabel={myRankLabel}
        highlights={highlights}
        challenges={challenges}
        onFire={onFire}
        milestones={milestones}
        explore={explore}
      />

      {/* Share + add (collapses once you've followed someone) */}
      <div id="grow" style={{ scrollMarginTop: 16 }}>
        <GrowCrew userId={userId} defaultOpen={followingIds.length === 0} />
      </div>
    </div>
    </PullToRefresh>
  );
}
