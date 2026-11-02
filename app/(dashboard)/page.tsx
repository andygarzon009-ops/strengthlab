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
    select: { name: true, timezone: true, image: true },
  });
  const tz = currentUser?.timezone || "UTC";
  const now = new Date();
  const part = (o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(now);
  const hour = Number(part({ hour: "numeric", hourCycle: "h23" }));
  const greeting = hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const weekday = part({ weekday: "short" }).toUpperCase();
  const dayNum = part({ day: "numeric" });
  const firstName = currentUser?.name?.split(" ")[0] ?? "Athlete";

  // The heavy nested workouts query lives inside <FeedList>, wrapped in
  // Suspense, so the page shell paints immediately instead of blocking.

  return (
    <PullToRefresh>
    <div className="relative isolate max-w-lg mx-auto px-4 pt-4">
      {/* A slim bar (wordmark, notifications, profile), then the greeting
          with today's date as a small calendar tile. New workouts and meals
          start from the + in the bottom bar. */}
      <div className="flex items-center justify-between h-11">
        <Wordmark size={18} />
        <div className="flex items-center gap-2">
          <NotificationsBell inline />
          <Link
            href="/profile"
            aria-label="Profile"
            className="w-10 h-10 rounded-full p-[2px] active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #4ade80, #15803d)" }}
          >
            {currentUser?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUser.image} alt="" className="w-full h-full rounded-full object-cover" style={{ border: "2px solid var(--bg)" }} />
            ) : (
              <span
                className="w-full h-full rounded-full flex items-center justify-center text-[15px] font-extrabold"
                style={{ background: "#1c1c1f", color: "#bbf7d0", border: "2px solid var(--bg)" }}
              >
                {firstName[0]?.toUpperCase()}
              </span>
            )}
          </Link>
        </div>
      </div>

      <div className="flex items-end justify-between gap-4 mt-4 mb-5 px-0.5">
        <div className="min-w-0">
          <p className="text-[15px]" style={{ color: "var(--fg-muted)" }}>
            {greeting},
          </p>
          <p className="text-[34px] font-extrabold leading-none mt-1 truncate" style={{ letterSpacing: "-0.04em" }}>
            {firstName}
          </p>
        </div>
        <div
          className="shrink-0 w-[54px] rounded-[14px] overflow-hidden flex flex-col items-center"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}
          aria-label={`Today, ${part({ weekday: "long", month: "long", day: "numeric" })}`}
        >
          <span className="w-full text-center text-[10px] font-extrabold py-[3px]" style={{ letterSpacing: "0.12em", background: "#22c55e", color: "#052e14" }}>
            {weekday}
          </span>
          <span className="text-[22px] font-extrabold tabular-nums pt-1 pb-1.5" style={{ letterSpacing: "-0.03em" }}>
            {dayNum}
          </span>
        </div>
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
