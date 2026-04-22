import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { logout } from "@/lib/actions/auth";
import { updateProfile as updateProfileAction } from "@/lib/actions/workouts";
import Link from "next/link";

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

      <div className="card p-5 mb-4">
        <h2 className="font-semibold text-[14px] tracking-tight mb-4">
          Edit profile
        </h2>
        <form
          action={async (formData) => {
            "use server";
            await updateProfileAction({
              name: formData.get("name") as string,
              bodyweight: formData.get("bodyweight")
                ? parseFloat(formData.get("bodyweight") as string)
                : undefined,
              goals: formData.get("goals") as string,
              preferredSplit: formData.get("preferredSplit") as string,
              bio: formData.get("bio") as string,
              coachPrompt: formData.get("coachPrompt") as string,
            });
          }}
          className="space-y-3"
        >
          <Field label="Name" name="name" defaultValue={user.name} />
          <Field
            label="Body weight"
            name="bodyweight"
            type="number"
            defaultValue={user.bodyweight?.toString() ?? ""}
            placeholder="185"
            suffix="lb"
          />
          <Field
            label="Goals"
            name="goals"
            defaultValue={user.goals ?? ""}
            placeholder="e.g. 315 squat, build muscle"
          />
          <Field
            label="Preferred split"
            name="preferredSplit"
            defaultValue={user.preferredSplit ?? ""}
            placeholder="e.g. Push / Pull / Legs"
          />
          <div>
            <label className="label block mb-1.5">Bio</label>
            <textarea
              name="bio"
              defaultValue={user.bio ?? ""}
              placeholder="A bit about you…"
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none resize-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="label">Coach instructions</label>
              <span
                className="text-[10px]"
                style={{ color: "var(--fg-dim)" }}
              >
                Shapes your AI coach
              </span>
            </div>
            <textarea
              name="coachPrompt"
              defaultValue={user.coachPrompt ?? ""}
              placeholder="e.g. Be brutal and honest. Focus on powerlifting. Push progressive overload hard. Never sugarcoat it."
              rows={4}
              className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none leading-relaxed"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>
          <button
            type="submit"
            className="btn-accent w-full py-3 rounded-xl text-[14px] mt-2"
          >
            Save changes
          </button>
        </form>
      </div>

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

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
  suffix,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <div className="relative">
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            paddingRight: suffix ? "3rem" : undefined,
          }}
        />
        {suffix && (
          <span
            className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] label"
            style={{ color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
