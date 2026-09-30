import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import WeeklyRecap from "@/components/WeeklyRecap";
import DailyGlanceCard from "@/components/DailyGlanceCard";
import PullToRefresh from "@/components/PullToRefresh";
import ConsistencyCard from "@/components/ConsistencyCard";
import HeartRateCard from "@/components/HeartRateCard";
import PendingInvites from "@/components/PendingInvites";
import FeedWorkoutCard from "@/components/FeedWorkoutCard";
import { CardSkeleton, FeedListSkeleton } from "@/components/FeedSkeletons";
import Wordmark from "@/components/Wordmark";

export default async function FeedPage() {
  const userId = await requireAuth();
  // The feed is your own training. Friends' sessions live on the Crew page.
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, trainingDays: true },
  });

  // The heavy nested workouts query lives inside <FeedList>, wrapped in
  // Suspense, so the page shell paints immediately instead of blocking.

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
          <Wordmark size={28} />
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

      {/* Each card streams in independently. The glance rings make live
          Google Health calls — Suspense keeps them from blocking the rest
          of the feed. */}
      {/* A waiting invite outranks everything: somebody is in a gym right
          now waiting on an answer. Streams on its own so it can't be held
          up by anything below it. */}
      <Suspense fallback={null}>
        <PendingInvites userId={userId} />
      </Suspense>
      {/* The training phase heads this card, so the week reads in the
          context of where the cycle is. */}
      <Suspense fallback={<CardSkeleton height={150} />}>
        <WeeklyRecap userId={userId} />
      </Suspense>
      {/* Heart rate reads stored values, not Google Health, so it can't
          hold up the rest. */}
      <Suspense fallback={<CardSkeleton height={112} />}>
        <HeartRateCard userId={userId} />
      </Suspense>
      <Suspense fallback={<CardSkeleton height={120} />}>
        <ConsistencyCard
          userId={userId}
          trainingDaysGoal={currentUser?.trainingDays ?? null}
        />
      </Suspense>
      {/* Direction A: Recovery + Fuel + Activity consolidated into one
          glance ring-row, each expanding inline on tap. */}
      <Suspense fallback={<CardSkeleton height={108} />}>
        <DailyGlanceCard userId={userId} />
      </Suspense>

      <Suspense fallback={<FeedListSkeleton />}>
        <FeedList userId={userId} />
      </Suspense>
    </div>
    </PullToRefresh>
  );
}

/// The workout feed itself — the heaviest query (workouts × exercises × sets ×
/// reactions × comments). Isolated in its own async component so it streams in
/// behind a skeleton rather than blocking the page shell.
async function FeedList({ userId }: { userId: string }) {
  const workouts = await prisma.workout.findMany({
    where: { userId },
    include: {
      user: true,
      exercises: {
        include: { exercise: true, sets: true },
        orderBy: { order: "asc" },
      },
      reactions: { include: { user: true } },
      comments: { include: { user: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { exercises: true } },
      // Who else was in the gym for this one. Only joined members — an invite
      // nobody accepted isn't a training partner.
      session: {
        select: {
          members: {
            where: { status: "JOINED" },
            select: { userId: true, user: { select: { name: true } } },
          },
        },
      },
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
          Nothing logged yet
        </h2>
        <p className="text-sm mb-6" style={{ color: "var(--fg-muted)" }}>
          Log your first session, or follow friends on the Crew tab to see their workouts.
        </p>
        <Link
          href="/log"
          className="btn-accent inline-block px-6 py-3 rounded-xl text-sm"
        >
          Log First Session
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
          currentUserId={userId}
        />
      ))}
    </div>
  );
}
