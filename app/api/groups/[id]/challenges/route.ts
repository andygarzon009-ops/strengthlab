import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { subDays } from "date-fns";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAuth();
  const { id: groupId } = await params;

  const membership = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });
  if (!membership) {
    return Response.json({ error: "Not a member" }, { status: 403 });
  }

  const members = await prisma.groupMember.findMany({
    where: { groupId },
    select: { userId: true },
  });
  const memberIds = members.map((m) => m.userId);

  const weekAgo = subDays(new Date(), 7);

  const prsThisWeek = await prisma.personalRecord.findMany({
    where: {
      userId: { in: memberIds },
      type: "WEIGHT",
      date: { gte: weekAgo },
    },
    include: {
      user: { select: { id: true, name: true } },
      exercise: { select: { name: true } },
    },
    orderBy: { value: "desc" },
    take: 5,
  });

  return Response.json({
    biggestPRs: prsThisWeek.map((pr) => ({
      userId: pr.userId,
      userName: pr.user.name,
      exerciseName: pr.exercise.name,
      weight: pr.value,
      reps: pr.reps ?? 1,
      date: pr.date,
    })),
  });
}
