import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import Link from "next/link";
import WeeklyRecap from "@/components/WeeklyRecap";
import GroupFeed from "@/components/GroupFeed";
import ConsistencySparkline from "@/components/ConsistencySparkline";
import FeedWorkoutCard from "@/components/FeedWorkoutCard";

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; mode?: string }>;
}) {
  const userId = await requireAuth();
  const { view, mode } = await searchParams;
  const groupMode = mode === "chat" ? "chat" : "feed";

  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: { group: { include: { members: { select: { userId: true } } } } },
  });

  const activeView = view ?? "mine";
  const activeGroup =
    activeView.startsWith("group-") &&
    memberships.find((m) => `group-${m.groupId}` === activeView);

  let scopedUserIds: string[];
  if (activeGroup) {
    scopedUserIds = activeGroup.group.members.map((gm) => gm.userId);
  } else {
    scopedUserIds = [userId];
  }

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

  const currentUser = await prisma.user.findUnique({ where: { id: userId } });

  return (
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

      {memberships.length > 0 && (
        <div
          className="flex gap-1.5 mb-5 overflow-x-auto -mx-4 px-4 pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          <FeedTab
            href="/"
            label="Mine"
            active={!activeGroup}
          />
          {memberships.map((m) => (
            <FeedTab
              key={m.groupId}
              href={`/?view=group-${m.groupId}`}
              label={m.group.name}
              active={activeGroup && activeGroup.groupId === m.groupId ? true : false}
            />
          ))}
        </div>
      )}

      {activeGroup && (
        <div
          className="flex gap-1.5 mb-4"
          style={{
            padding: 3,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: 10,
          }}
        >
          <SubTab
            href={`/?view=group-${activeGroup.groupId}`}
            label="Feed"
            active={groupMode === "feed"}
          />
          <SubTab
            href={`/?view=group-${activeGroup.groupId}&mode=chat`}
            label="Chat"
            active={groupMode === "chat"}
          />
        </div>
      )}

      {activeGroup && groupMode === "chat" && (
        <GroupFeed
          groupId={activeGroup.groupId}
          height="calc(100dvh - 380px)"
        />
      )}

      {!activeGroup && (
        <>
          <WeeklyRecap userId={userId} />
          <ConsistencySparkline
            userId={userId}
            trainingDaysGoal={currentUser?.trainingDays ?? null}
          />
        </>
      )}

      {(!activeGroup || groupMode === "feed") && (workouts.length === 0 ? (
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
          <p
            className="text-sm mb-6"
            style={{ color: "var(--fg-muted)" }}
          >
            Log your first session or join a group to see your crew&apos;s workouts.
          </p>
          <Link href="/log" className="btn-accent inline-block px-6 py-3 rounded-xl text-sm">
            Log First Session
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {workouts.map((workout) => (
            <FeedWorkoutCard
              key={workout.id}
              workout={workout}
              currentUserId={userId}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function SubTab({
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
      className="flex-1 text-center text-[12px] py-2 rounded-md label"
      style={
        active
          ? {
              background: "var(--accent)",
              color: "#0a0a0a",
            }
          : {
              color: "var(--fg-muted)",
            }
      }
    >
      {label}
    </Link>
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

