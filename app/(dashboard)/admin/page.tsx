import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { subDays, format } from "date-fns";
import { redirect } from "next/navigation";

// Simple email-gated admin view. Add more emails to ADMIN_EMAILS if you
// need to share the page with a cofounder or analyst later.
const ADMIN_EMAILS = ["andygarzon009@gmail.com"];

export default async function AdminPage() {
  const userId = await requireAuth();
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });

  if (!me || !ADMIN_EMAILS.includes(me.email.toLowerCase())) {
    redirect("/");
  }

  const now = new Date();
  const d7 = subDays(now, 7);
  const d30 = subDays(now, 30);

  const [
    users,
    workoutCount,
    workouts7,
    signups7,
    active7Rows,
    active30Rows,
    perUserWorkouts,
    perUserLastWorkout,
    perUserLastMsg,
  ] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, name: true, email: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.workout.count(),
    prisma.workout.count({ where: { date: { gte: d7 } } }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    // Active = any workout, coach message, or post in window.
    prisma.$queryRaw<{ userId: string }[]>`
      SELECT DISTINCT "userId" FROM "Workout" WHERE "date" >= ${d7}
      UNION
      SELECT DISTINCT "userId" FROM "TrainerMessage" WHERE "createdAt" >= ${d7}
      UNION
      SELECT DISTINCT "userId" FROM "GroupPost" WHERE "createdAt" >= ${d7}
    `,
    prisma.$queryRaw<{ userId: string }[]>`
      SELECT DISTINCT "userId" FROM "Workout" WHERE "date" >= ${d30}
      UNION
      SELECT DISTINCT "userId" FROM "TrainerMessage" WHERE "createdAt" >= ${d30}
      UNION
      SELECT DISTINCT "userId" FROM "GroupPost" WHERE "createdAt" >= ${d30}
    `,
    prisma.workout.groupBy({
      by: ["userId"],
      _count: { _all: true },
    }),
    prisma.workout.groupBy({
      by: ["userId"],
      _max: { date: true },
    }),
    prisma.trainerMessage.groupBy({
      by: ["userId"],
      _max: { createdAt: true },
    }),
  ]);

  const active7Set = new Set(active7Rows.map((r) => r.userId));
  const active30Set = new Set(active30Rows.map((r) => r.userId));
  const workoutsByUser = new Map(
    perUserWorkouts.map((r) => [r.userId, r._count._all])
  );
  const lastWorkoutByUser = new Map(
    perUserLastWorkout.map((r) => [r.userId, r._max.date])
  );
  const lastMsgByUser = new Map(
    perUserLastMsg.map((r) => [r.userId, r._max.createdAt])
  );

  const rows = users.map((u) => {
    const lastWo = lastWorkoutByUser.get(u.id) ?? null;
    const lastMsg = lastMsgByUser.get(u.id) ?? null;
    const lastActivity = [lastWo, lastMsg]
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      ...u,
      workouts: workoutsByUser.get(u.id) ?? 0,
      lastActivity: lastActivity ?? null,
      activeWeek: active7Set.has(u.id),
    };
  });

  const summary = [
    { label: "Total users", value: users.length },
    { label: "Active 7d", value: active7Set.size },
    { label: "Active 30d", value: active30Set.size },
    { label: "Signups 7d", value: signups7 },
    { label: "Total workouts", value: workoutCount },
    { label: "Workouts 7d", value: workouts7 },
  ];

  return (
    <div className="max-w-3xl mx-auto px-4 pt-8 pb-24">
      <p className="label">Admin</p>
      <h1 className="text-[26px] font-bold tracking-tight leading-none mt-1 mb-6">
        Usage
      </h1>

      <div className="grid grid-cols-3 gap-2 mb-6">
        {summary.map((s) => (
          <div key={s.label} className="card p-3">
            <p
              className="label text-[9px]"
              style={{ color: "var(--fg-dim)" }}
            >
              {s.label}
            </p>
            <p
              className="nums text-[22px] font-bold leading-none mt-1"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div
          className="grid grid-cols-[1fr_70px_90px_60px] px-3 py-2 text-[10px] label"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--fg-dim)",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <span>User</span>
          <span className="text-right">Signed up</span>
          <span className="text-right">Last seen</span>
          <span className="text-right">Workouts</span>
        </div>
        {rows.map((r, i) => (
          <div
            key={r.id}
            className="grid grid-cols-[1fr_70px_90px_60px] px-3 py-2.5 items-center text-[12px]"
            style={{
              borderBottom:
                i === rows.length - 1
                  ? "none"
                  : "1px solid var(--border)",
              background: r.activeWeek
                ? "rgba(34,197,94,0.04)"
                : "transparent",
            }}
          >
            <div className="min-w-0">
              <p className="font-semibold truncate flex items-center gap-1.5">
                {r.activeWeek && (
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: "var(--accent)" }}
                    title="Active last 7 days"
                  />
                )}
                {r.name}
              </p>
              <p
                className="text-[10px] truncate"
                style={{ color: "var(--fg-dim)" }}
              >
                {r.email}
              </p>
            </div>
            <span
              className="text-right nums text-[11px]"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: "var(--fg-muted)",
              }}
            >
              {format(r.createdAt, "MMM d")}
            </span>
            <span
              className="text-right nums text-[11px]"
              style={{
                fontFamily: "var(--font-geist-mono)",
                color: r.lastActivity ? "var(--fg-muted)" : "var(--fg-dim)",
              }}
            >
              {r.lastActivity ? format(r.lastActivity, "MMM d") : "—"}
            </span>
            <span
              className="text-right nums text-[12px] font-semibold"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {r.workouts}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
