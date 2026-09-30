import Link from "next/link";
import { prisma } from "@/lib/db";
import { localDateKey } from "@/lib/blockStamp";
import Avatar from "@/components/Avatar";

const SHOWN = 5;

// One row of the people you follow, ringed green if they've trained today —
// the crew at a glance, without a tab. Taps through to the Crew page.
export default async function CrewPulse({ userId }: { userId: string }) {
  const [viewer, follows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.follow.findMany({
      where: { followerId: userId },
      select: { following: { select: { id: true, name: true, image: true } } },
    }),
  ]);
  if (follows.length === 0) return null;
  const people = follows.map((f) => f.following);

  // "Today" is the viewer's day. A 36 h window covers every timezone offset;
  // the exact day is decided by the local date key.
  const tz = viewer?.timezone || "UTC";
  const todayKey = localDateKey(new Date(), tz);
  const recent = await recentWorkouts(people.map((p) => p.id));
  const trained = new Set(
    recent.filter((w) => localDateKey(w.date, tz) === todayKey).map((w) => w.userId),
  );

  const ordered = [
    ...people.filter((p) => trained.has(p.id)),
    ...people.filter((p) => !trained.has(p.id)),
  ].slice(0, SHOWN);
  const names = people
    .filter((p) => trained.has(p.id))
    .map((p) => p.name.split(" ")[0]);
  const line =
    names.length === 0
      ? "No one in your crew has trained yet today"
      : names.length === 1
        ? `${names[0]} trained today`
        : names.length === 2
          ? `${names[0]} and ${names[1]} trained today`
          : `${names[0]}, ${names[1]} and ${names.length - 2} more trained today`;

  return (
    <Link
      href="/group"
      className="flex items-center gap-3.5 py-2 px-1.5 mb-3 active:opacity-70"
    >
      <div className="flex items-center gap-2.5 shrink-0">
        {ordered.map((p) => (
          <span
            key={p.id}
            className="rounded-full"
            style={{
              boxShadow: trained.has(p.id)
                ? "0 0 0 2px var(--bg), 0 0 0 4px var(--accent)"
                : "0 0 0 2px var(--bg), 0 0 0 3px var(--border)",
            }}
          >
            <Avatar name={p.name} image={p.image} size={30} />
          </span>
        ))}
      </div>
      <p className="text-[13px] truncate" style={{ color: "var(--fg-muted)" }}>
        {names.length > 0 ? (
          <>
            <span className="font-semibold" style={{ color: "var(--fg)" }}>
              {line.replace(/ trained today$/, "")}
            </span>{" "}
            trained today
          </>
        ) : (
          line
        )}
      </p>
    </Link>
  );
}

function recentWorkouts(userIds: string[]) {
  return prisma.workout.findMany({
    where: {
      userId: { in: userIds },
      date: { gte: new Date(Date.now() - 36 * 3_600_000) },
    },
    select: { userId: true, date: true },
  });
}
