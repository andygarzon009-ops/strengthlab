import Link from "next/link";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { shapeForType } from "@/lib/exercises";
import ShareProfileButton from "@/components/ShareProfileButton";
import AddFollow from "@/components/AddFollow";

export const dynamic = "force-dynamic";

function relative(d: Date | null): string {
  if (!d) return "no sessions yet";
  const day = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (day <= 0) return "trained today";
  if (day === 1) return "trained yesterday";
  if (day < 7) return `trained ${day}d ago`;
  return `last ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
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
      select: { id: true, name: true },
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

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="mb-6">
        <p className="label">Crew</p>
        <h1 className="text-[28px] font-bold tracking-tight leading-none mt-1">
          Train together
        </h1>
      </div>

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

      {/* People you follow */}
      {followingPeople.length > 0 && (
        <div className="mb-6">
          <p
            className="text-[10px] uppercase tracking-wider font-semibold mb-2"
            style={{ color: "var(--fg-dim)" }}
          >
            People
          </p>
          <div
            className="rounded-2xl divide-y"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            {followingPeople.map((p) => (
              <Link
                key={p.id}
                href={`/u/${p.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors"
              >
                <span className="text-[14px] font-medium truncate">{p.name}</span>
                <span
                  className="text-[11px] shrink-0 ml-2"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {relative(p.last)} ›
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Share + add */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <p className="text-[13px] font-semibold mb-1">Grow your crew</p>
        <p className="text-[12px] mb-3" style={{ color: "var(--fg-dim)" }}>
          Share your profile so friends can follow you, or paste a friend&apos;s
          link to follow them.
        </p>
        <div className="mb-3">
          <ShareProfileButton userId={userId} />
        </div>
        <AddFollow />
      </div>
    </div>
  );
}
