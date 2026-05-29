import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { shapeForType } from "@/lib/exercises";
import { loadTopChallenge } from "@/lib/loadChallenges";
import { challengeTypeLabel, formatScore, timeLeft } from "@/lib/crewChallenges";
import GrowCrew from "@/components/GrowCrew";
import CheerButton from "@/components/CheerButton";
import Avatar from "@/components/Avatar";

export const dynamic = "force-dynamic";

function ago(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  const day = Math.floor(s / 86_400);
  return day === 1 ? "yesterday" : `${day}d ago`;
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

function fmtVol(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
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

  const [people, lastByUser, weekWorkouts] = await Promise.all([
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

  // Highlights: recent weight PRs from people you follow, each cheerable
  // (a cheer is a 🏆 reaction on the underlying workout).
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
  const highlights = prRows.map((p) => ({
    id: p.id,
    who: nameById.get(p.userId) ?? "Athlete",
    text: `PR'd ${p.exercise.name} ${Math.round(p.value)}${
      p.reps ? ` × ${p.reps}` : ""
    }`,
    workoutId: p.workoutId as string,
    date: p.date,
    count: cheerCount.get(p.workoutId as string) ?? 0,
    cheered: iCheered.has(p.workoutId as string),
  }));

  const topChallenge = await loadTopChallenge(userId);

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
        {circles.map((c) => {
          const ring = ringFor(c.last);
          return (
            <Link
              key={c.id}
              href={`/u/${c.id}`}
              className="flex flex-col items-center gap-1.5 shrink-0"
              style={{ width: 64 }}
            >
              <Avatar name={c.name} image={c.image} size={60} ring={ring} />
              <span className="text-[11px] truncate w-full text-center">
                {c.name === "You" ? "You" : c.name.split(" ")[0]}
              </span>
            </Link>
          );
        })}
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

      {/* Active challenge */}
      {topChallenge ? (
        <Link
          href={`/group/challenges/${topChallenge.id}`}
          className="card block p-4 mb-6 transition-colors"
          style={{
            background:
              "linear-gradient(135deg, rgba(34,197,94,0.08) 0%, var(--bg-card) 70%)",
            border: "1px solid rgba(34,197,94,0.25)",
          }}
        >
          <div className="flex items-baseline justify-between mb-2">
            <div className="min-w-0">
              <p className="label" style={{ color: "var(--accent)" }}>
                🏆 Active challenge
              </p>
              <p className="text-[15px] font-bold tracking-tight truncate mt-0.5">
                {topChallenge.name}
              </p>
            </div>
            <span className="text-[10px] shrink-0 ml-2" style={{ color: "var(--fg-dim)" }}>
              {timeLeft(topChallenge.endsAt)}
            </span>
          </div>
          <div className="space-y-1">
            {topChallenge.standings.slice(0, 3).map((s, i) => (
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
                  {MEDAL[i] ?? `${i + 1}`} {s.name}
                  {s.reachedTarget ? " ✓" : ""}
                </span>
                <span
                  className="tabular-nums shrink-0 ml-2"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {formatScore(topChallenge.type, s.score)}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] mt-2" style={{ color: "var(--fg-dim)" }}>
            {challengeTypeLabel(topChallenge.type)} · view all challenges →
          </p>
        </Link>
      ) : (
        <Link
          href="/group/challenges"
          className="card block p-4 mb-6 text-center transition-colors"
        >
          <p className="text-[13px] font-semibold" style={{ color: "var(--accent)" }}>
            🏆 Start a challenge
          </p>
          <p className="text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
            Volume races, session counts, lift races, streak battles.
          </p>
        </Link>
      )}

      {/* Highlights — recent crew PRs, cheerable */}
      {highlights.length > 0 && (
        <div className="mb-6">
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-2"
            style={{ color: "var(--fg-dim)" }}
          >
            Highlights
          </p>
          <div
            className="rounded-2xl divide-y"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            {highlights.map((h) => (
              <div key={h.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-[16px] shrink-0">🏆</span>
                <Link href={`/workout/${h.workoutId}`} className="min-w-0 flex-1">
                  <p className="text-[13px] truncate">
                    <span className="font-semibold">{h.who}</span> {h.text}
                  </p>
                  <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                    {ago(h.date)}
                  </p>
                </Link>
                <CheerButton
                  workoutId={h.workoutId}
                  initialCheered={h.cheered}
                  initialCount={h.count}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* This-week ranking */}
      <div className="mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <p
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: "var(--fg-dim)" }}
          >
            This week
          </p>
          {anyActivity && myRank > 0 && (
            <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
              you&apos;re #{myRank}
              {myRank <= 3 ? ` ${MEDAL[myRank - 1]}` : ""}
            </p>
          )}
        </div>
        {!anyActivity ? (
          <div
            className="rounded-2xl p-5 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--fg-dim)" }}>
              {followingIds.length === 0
                ? "Follow some friends and your weekly ranking shows up here."
                : "Nobody has logged this week yet. Be first."}
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl divide-y"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            {ranked.map((r, i) => (
              <Link
                key={r.id}
                href={`/u/${r.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors"
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
                  <span
                    className="text-[11px] ml-1"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {r.sessions === 1 ? "session" : "sessions"} · {fmtVol(r.volume)} lb
                  </span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Share + add (collapses once you've followed someone) */}
      <div id="grow" style={{ scrollMarginTop: 16 }}>
        <GrowCrew userId={userId} defaultOpen={followingIds.length === 0} />
      </div>
    </div>
  );
}
