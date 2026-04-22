import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logout } from "@/lib/actions/auth";
import Link from "next/link";
import ProfileForm from "@/components/ProfileForm";

export default async function ProfilePage() {
  const userId = await requireAuth();

  const [user, workoutCount, prCount, prs] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.workout.count({ where: { userId } }),
    prisma.personalRecord.count({ where: { userId } }),
    prisma.personalRecord.findMany({
      where: { userId, type: "WEIGHT" },
      include: { exercise: true },
      orderBy: { value: "desc" },
      take: 5,
    }),
  ]);

  if (!user) return null;

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-4 mb-8">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center text-[22px] font-semibold"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent)",
            border: "1px solid rgba(34,197,94,0.25)",
          }}
        >
          {user.name[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight leading-none truncate">
            {user.name}
          </h1>
          <p
            className="text-[12px] mt-1 truncate"
            style={{ color: "var(--fg-dim)" }}
          >
            {user.email}
          </p>
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-px card overflow-hidden mb-4"
        style={{ background: "var(--border)", padding: 0 }}
      >
        {[
          { label: "Sessions", value: workoutCount },
          { label: "PRs", value: prCount },
          {
            label: "Body",
            value: user.bodyweight ?? "—",
            suffix: user.bodyweight ? "lb" : undefined,
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="px-3 py-4 text-center"
            style={{ background: "var(--bg-card)" }}
          >
            <p
              className="font-semibold text-[20px] leading-none tracking-tight nums"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              {stat.value}
              {stat.suffix && (
                <span
                  className="text-[11px] ml-0.5 font-normal"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {stat.suffix}
                </span>
              )}
            </p>
            <p
              className="label text-[9px] mt-1.5"
              style={{ color: "var(--fg-dim)" }}
            >
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {prs.length > 0 && (
        <div className="card p-5 mb-4">
          <h2 className="font-semibold text-[14px] tracking-tight mb-3">
            Top lifts
          </h2>
          <div className="space-y-2">
            {prs.map((pr) => (
              <div
                key={pr.id}
                className="flex items-center justify-between py-1"
              >
                <span className="text-[13px]">{pr.exercise.name}</span>
                <span
                  className="font-semibold text-[14px] nums"
                  style={{
                    color: "var(--accent)",
                    fontFamily: "var(--font-geist-mono)",
                  }}
                >
                  {pr.value}
                  <span
                    className="text-[10px] ml-0.5 font-normal"
                    style={{ opacity: 0.6 }}
                  >
                    lb
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <ProfileForm
        user={{
          name: user.name,
          email: user.email,
          bodyweight: user.bodyweight,
          preferredSplit: user.preferredSplit,
          bio: user.bio,
          experienceLevel: user.experienceLevel,
          primaryFocus: user.primaryFocus,
          trainingPhase: user.trainingPhase,
          trainingDays: user.trainingDays,
          injuries: user.injuries,
          coachPrompt: user.coachPrompt,
          height: user.height,
          restingHR: user.restingHR,
          waist: user.waist,
          hips: user.hips,
          chest: user.chest,
          shoulders: user.shoulders,
          neck: user.neck,
          arm: user.arm,
          forearm: user.forearm,
          thigh: user.thigh,
          calf: user.calf,
        }}
      />

      <div className="space-y-2">
        <Link
          href="/group"
          className="card flex items-center justify-between px-4 py-4 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "var(--bg-elevated)" }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--fg-muted)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="9" cy="7" r="3" />
                <circle cx="17" cy="9" r="2.5" />
                <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" />
                <path d="M15 20c0-2 1.5-4 4-4s4 2 4 4" />
              </svg>
            </div>
            <span className="font-medium text-[14px]">Crew</span>
          </div>
          <span style={{ color: "var(--fg-dim)" }}>→</span>
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="w-full card flex items-center justify-between px-4 py-4 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: "rgba(239,68,68,0.08)" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f87171"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5M21 12H9" />
                </svg>
              </div>
              <span
                className="font-medium text-[14px]"
                style={{ color: "#f87171" }}
              >
                Sign out
              </span>
            </div>
          </button>
        </form>
      </div>
    </div>
  );
}

