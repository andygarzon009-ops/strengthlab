import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { WORKOUT_TYPES } from "@/lib/exercises";
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

  // Recent workout types
  const recentWorkouts = await prisma.workout.findMany({
    where: { userId },
    select: { type: true },
    orderBy: { date: "desc" },
    take: 10,
  });

  const splits = WORKOUT_TYPES.map((t) => ({
    ...t,
    count: recentWorkouts.filter((w) => w.type === t.value).length,
  })).filter((t) => t.count > 0);

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-orange-500/20 flex items-center justify-center text-3xl font-bold text-orange-400">
          {user.name[0].toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">{user.name}</h1>
          <p className="text-zinc-500 text-sm">{user.email}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Workouts", value: workoutCount },
          { label: "PRs Set", value: prCount },
          {
            label: "Body Weight",
            value: user.bodyweight ? `${user.bodyweight}` : "—",
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-center"
          >
            <p className="text-white font-bold text-xl">{stat.value}</p>
            <p className="text-zinc-500 text-xs">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Top PRs */}
      {prs.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <h2 className="text-white font-semibold mb-3">🏆 Top Lifts</h2>
          <div className="space-y-2">
            {prs.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between">
                <span className="text-zinc-300 text-sm">{pr.exercise.name}</span>
                <span className="text-orange-400 font-bold text-sm">{pr.value} lbs</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit profile form */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
        <h2 className="text-white font-semibold mb-4">Edit Profile</h2>
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
            });
          }}
          className="space-y-3"
        >
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Name</label>
            <input
              name="name"
              defaultValue={user.name}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Body Weight (lbs)</label>
            <input
              name="bodyweight"
              type="number"
              defaultValue={user.bodyweight ?? ""}
              placeholder="185"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Goals</label>
            <input
              name="goals"
              defaultValue={user.goals ?? ""}
              placeholder="e.g. Reach 315 squat, build muscle"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Preferred Split</label>
            <input
              name="preferredSplit"
              defaultValue={user.preferredSplit ?? ""}
              placeholder="e.g. Push/Pull/Legs, Upper/Lower"
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Bio</label>
            <textarea
              name="bio"
              defaultValue={user.bio ?? ""}
              placeholder="A bit about you..."
              rows={2}
              className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none"
            />
          </div>
          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-400 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            Save Changes
          </button>
        </form>
      </div>

      {/* Links */}
      <div className="space-y-2">
        <Link
          href="/group"
          className="flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 hover:border-zinc-700 transition-colors"
        >
          <span className="text-white font-medium">👥 Groups</span>
          <span className="text-zinc-500">→</span>
        </Link>

        <form action={logout}>
          <button
            type="submit"
            className="w-full flex items-center justify-between bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-4 hover:border-red-500/30 transition-colors"
          >
            <span className="text-red-400 font-medium">Sign Out</span>
            <span className="text-zinc-500">→</span>
          </button>
        </form>
      </div>
    </div>
  );
}
