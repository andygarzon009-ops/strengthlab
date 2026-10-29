import { Suspense } from "react";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import WeeklyRecap from "@/components/WeeklyRecap";
import PullToRefresh from "@/components/PullToRefresh";
import PendingInvites from "@/components/PendingInvites";
import FeedWorkoutCard from "@/components/FeedWorkoutCard";
import { CardSkeleton, FeedListSkeleton } from "@/components/FeedSkeletons";
import Wordmark from "@/components/Wordmark";
import FeedTop, { FeedPRs } from "@/components/FeedTop";
import CrewPulse from "@/components/CrewPulse";
import NotificationsBell from "@/components/NotificationsBell";
import { loadSessionProgress } from "@/lib/sessionProgress";

export default async function FeedPage() {
  const userId = await requireAuth();
  // The feed is your own training. Friends' sessions live on the Crew page.
  const currentUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, timezone: true },
  });
  const dateLine = new Intl.DateTimeFormat("en-US", {
    timeZone: currentUser?.timezone || "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .formatToParts(new Date())
    .filter((p) => p.type === "weekday" || p.type === "month" || p.type === "day")
    .map((p) => p.value);

  // The heavy nested workouts query lives inside <FeedList>, wrapped in
  // Suspense, so the page shell paints immediately instead of blocking.

  return (
    <PullToRefresh>
    <div className="relative isolate max-w-lg mx-auto px-4 pt-8">
      {/* Name, wordmark, today's date; notifications on the right. New
          workouts and meals start from the + in the bottom bar. */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p
            className="label mb-1"
            style={{ color: "var(--accent)" }}
          >
            {currentUser?.name?.split(" ")[0] ?? "Athlete"}
          </p>
          <Wordmark size={26} />
          <p className="label text-[11px] mt-1.5" style={{ color: "var(--fg-muted)" }}>
            {dateLine[0]} · {dateLine[1]} {dateLine[2]}
          </p>
        </div>
        <NotificationsBell inline />
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
      {/* A fresh PR leads for 48 h as a slim strip, then Today (training
          block, readiness, Macros / Activity), then This week (days, stats,
          muscle recovery, heart rate). */}
      <Suspense fallback={null}>
        <FeedPRs userId={userId} />
      </Suspense>
      <Suspense fallback={<CardSkeleton height={290} />}>
        <FeedTop userId={userId} />
      </Suspense>
      <Suspense fallback={<CardSkeleton height={300} />}>
        <WeeklyRecap userId={userId} />
      </Suspense>
      <Suspense fallback={null}>
        <CrewPulse userId={userId} />
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

  // Best-effort: the cards render fine without their progress row.
  const progress = await loadSessionProgress(userId, workouts).catch(
    () => ({}) as Awaited<ReturnType<typeof loadSessionProgress>>,
  );

  return (
    <>
      <h2
        className="label text-[11px] mt-5 mb-2.5 px-0.5"
        style={{ color: "var(--fg-dim)" }}
      >
        Your sessions
      </h2>
      <div className="space-y-3">
        {workouts.map((workout) => (
          <FeedWorkoutCard
            key={workout.id}
            workout={workout}
            currentUserId={userId}
            progress={progress[workout.id]}
          />
        ))}
      </div>
    </>
  );
}
