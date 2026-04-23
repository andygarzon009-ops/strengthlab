import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { subDays } from "date-fns";
import { shapeForType } from "@/lib/exercises";

export async function GET() {
  const userId = await requireAuth();
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });

  const allMemberIds = [
    ...new Set(
      memberships.flatMap((m) => m.group.members.map((gm) => gm.userId))
    ),
  ];

  const weekAgo = subDays(new Date(), 7);
  const weeklyWorkouts = await prisma.workout.findMany({
    where: { userId: { in: allMemberIds }, date: { gte: weekAgo } },
    include: {
      exercises: { include: { sets: true } },
    },
  });

  const statsByUser = new Map<
    string,
    { sessions: number; sets: number }
  >();
  for (const w of weeklyWorkouts) {
    const stat = statsByUser.get(w.userId) ?? { sessions: 0, sets: 0 };
    stat.sessions += 1;
    if (shapeForType(w.type) === "STRENGTH") {
      stat.sets += w.exercises.flatMap((e) =>
        e.sets.filter((s) => s.type === "WORKING")
      ).length;
    }
    statsByUser.set(w.userId, stat);
  }

  const groups = memberships.map((m) => ({
    ...m.group,
    myRole: m.role,
    members: m.group.members.map((gm) => ({
      ...gm,
      weekSessions: statsByUser.get(gm.userId)?.sessions ?? 0,
      weekSets: statsByUser.get(gm.userId)?.sets ?? 0,
    })),
  }));
  return Response.json(groups);
}
