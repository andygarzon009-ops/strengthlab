import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import WeeklyRecap from "@/components/WeeklyRecap";
import ActivityRingsCard from "@/components/ActivityRingsCard";
import NutritionScoreCard from "@/components/NutritionScoreCard";
import HeartRateCard from "@/components/HeartRateCard";
import PullToRefresh from "@/components/PullToRefresh";
import ConsistencyCard from "@/components/ConsistencyCard";
import RecoveryCard from "@/components/RecoveryCard";
import FeedWorkoutCard from "@/components/FeedWorkoutCard";
import { CardSkeleton, FeedListSkeleton } from "@/components/FeedSkeletons";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; user?: string }>;
}) {
  const userId = await requireAuth();
  const { view, user: filterUserParam } = await searchParams;

  // Crew = people you follow. Drives the "Crew" feed tab + per-person filter.
  // These two are independent, so fetch them in parallel instead of serially.
  const [follows, currentUser] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { following: { select: { id: true, name: true } } },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, trainingDays: true },
    }),
  ]);
  const followingPeople = follows.map((f) => f.following);
  const followingIds = followingPeople.map((p) => p.id);

  const isCrew = view === "crew" && followingIds.length > 0;
  const filterUserId =
    isCrew && filterUserParam && followingIds.includes(filterUserParam)
      ? filterUserParam
      : null;

  const scopedUserIds = isCrew
    ? filterUserId
      ? [filterUserId]
      : followingIds
    : [userId];

  // The heavy nested workouts query now lives inside <FeedList>, wrapped in
  // Suspense, so the page shell + tabs paint immediately instead of blocking.

  return (
    <PullToRefresh>
    <div className="max-w-lg mx-auto px-4 pt-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <p
            className="label mb-1"
            style={{ color: "var(--accent)" }}
          >
            {currentUser?.name?.split(" ")[0] ?? "Athlete"}
          </p>
          <h1 className="text-[28px] font-bold tracking-tight leading-none">
            StrengthLab
          </h1>
        </div>
        <Link
          href="/log"
          className="btn-accent px-4 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          New
        </Link>
      </div>

      {followingIds.length > 0 && (
        <div
          className="flex gap-1.5 mb-5 overflow-x-auto -mx-4 px-4 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          <FeedTab href="/" label="Mine" active={!isCrew} />
          <FeedTab href="/?view=crew" label="Crew" active={isCrew} />
        </div>
      )}

      {isCrew && followingPeople.length > 1 && (
        <div
          className="flex gap-1.5 mb-4 overflow-x-auto -mx-4 px-4 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          <FeedTab href="/?view=crew" label="All" active={!filterUserId} />
          {followingPeople.map((p) => (
            <FeedTab
              key={p.id}
              href={`/?view=crew&user=${p.id}`}
              label={p.name.split(" ")[0]}
              active={filterUserId === p.id}
            />
          ))}
        </div>
      )}

      {!isCrew && (
        <>
          {/* Each card streams in independently. HeartRate/ActivityRings make
              live Google Health calls — Suspense keeps them from blocking the
              rest of the feed. */}
          <Suspense fallback={<CardSkeleton height={132} />}>
            <WeeklyRecap userId={userId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={168} />}>
            <ActivityRingsCard userId={userId} />
          </Suspense>
          {/* Self-fetching client card — sits right under the activity rings. */}
          <NutritionScoreCard />
          <Suspense fallback={null}>
            <RecoveryCard userId={userId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={148} />}>
            <HeartRateCard userId={userId} />
          </Suspense>
          <Suspense fallback={<CardSkeleton height={120} />}>
            <ConsistencyCard
              userId={userId}
              trainingDaysGoal={currentUser?.trainingDays ?? null}
            />
          </Suspense>
        </>
      )}

      <Suspense fallback={<FeedListSkeleton />}>
        <FeedList
          scopedUserIds={scopedUserIds}
          currentUserId={userId}
          isCrew={isCrew}
        />
      </Suspense>
    </div>
    </PullToRefresh>
  );
}

/// The workout feed itself — the heaviest query (workouts × exercises × sets ×
/// reactions × comments). Isolated in its own async component so it streams in
/// behind a skeleton rather than blocking the page shell.
async function FeedList({
  scopedUserIds,
  currentUserId,
  isCrew,
}: {
  scopedUserIds: string[];
  currentUserId: string;
  isCrew: boolean;
}) {
  const workouts = await prisma.workout.findMany({
    where: { userId: { in: scopedUserIds } },
    include: {
      user: true,
      exercises: {
        include: { exercise: true, sets: true },
        orderBy: { order: "asc" },
      },
      reactions: { include: { user: true } },
      comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { exercises: true } },
    },
    orderBy: { date: "desc" },
    take: 20,
  });

  if (workouts.length === 0) {
    return (
      <div className="text-center py-16 card px-6">
        <div
          className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
          style={{
            background: "var(--accent-dim)",
            border: "1px solid rgba(34,197,94,0.25)",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 4h2v16H6zM16 4h2v16h-2zM3 8h3v8H3zM18 8h3v8h-3zM8 11h8v2H8z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold tracking-tight mb-1.5">
          {isCrew ? "Your crew is quiet" : "Nothing logged yet"}
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--fg-muted)" }}>
          {isCrew
            ? "Nobody you follow has logged a session yet."
            : "Log your first session, or follow friends on the Crew tab to see their workouts."}
        </p>
        <Link
          href={isCrew ? "/group" : "/log"}
          className="btn-accent inline-block px-6 py-3 rounded-xl text-sm"
        >
          {isCrew ? "Find your crew" : "Log First Session"}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {workouts.map((workout) => (
        <FeedWorkoutCard
          key={workout.id}
          workout={workout}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
}

function FeedTab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      className="text-[12px] px-3.5 py-1.5 rounded-full whitespace-nowrap shrink-0 label"
      style={
        active
          ? {
              background: "var(--accent)",
              color: "#0a0a0a",
              border: "1px solid var(--accent)",
            }
          : {
              background: "var(--bg-elevated)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border)",
            }
      }
    >
      {label}
    </Link>
  );
}

