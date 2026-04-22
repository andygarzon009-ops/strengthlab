"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { subDays } from "date-fns";

export type ChallengeType = "LIFT" | "SESSIONS_WEEK" | "VOLUME_WEEK";

async function assertMember(groupId: string, userId: string) {
  const m = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });
  if (!m) throw new Error("Not a member of this group");
  return m;
}

export async function createChallenge(input: {
  groupId: string;
  type: ChallengeType;
  exerciseId?: string;
  targetValue: number;
  targetReps?: number;
  deadline?: string;
}) {
  const userId = await requireAuth();
  await assertMember(input.groupId, userId);

  if (input.type === "LIFT" && !input.exerciseId) {
    return { error: "Pick an exercise for a lift challenge." };
  }
  if (!input.targetValue || input.targetValue <= 0) {
    return { error: "Target must be greater than 0." };
  }

  const challenge = await prisma.challenge.create({
    data: {
      groupId: input.groupId,
      creatorId: userId,
      type: input.type,
      exerciseId: input.exerciseId,
      targetValue: input.targetValue,
      targetReps: input.targetReps,
      deadline: input.deadline ? new Date(input.deadline) : null,
      participants: { create: { userId } },
    },
  });

  await prisma.groupPost.create({
    data: {
      groupId: input.groupId,
      userId,
      text: "",
      cardType: "CHALLENGE",
      challengeId: challenge.id,
    },
  });

  revalidatePath("/");
  revalidatePath("/group");
  return { success: true };
}

export async function joinChallenge(challengeId: string) {
  const userId = await requireAuth();
  const ch = await prisma.challenge.findUnique({
    where: { id: challengeId },
  });
  if (!ch) return { error: "Challenge not found" };
  await assertMember(ch.groupId, userId);
  try {
    await prisma.challengeParticipant.create({
      data: { challengeId, userId },
    });
  } catch {
    // already joined — ignore
  }
  revalidatePath("/");
  revalidatePath("/group");
  return { success: true };
}

export async function leaveChallenge(challengeId: string) {
  const userId = await requireAuth();
  await prisma.challengeParticipant.deleteMany({
    where: { challengeId, userId },
  });
  revalidatePath("/");
  revalidatePath("/group");
  return { success: true };
}

export async function getChallengeProgress(challengeId: string) {
  const challenge = await prisma.challenge.findUnique({
    where: { id: challengeId },
    include: {
      exercise: true,
      participants: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });
  if (!challenge) return null;

  const userIds = challenge.participants.map((p) => p.userId);
  if (userIds.length === 0) return { challenge, progress: [] };

  let progress: Array<{
    userId: string;
    userName: string;
    current: number;
    hit: boolean;
  }> = [];

  if (challenge.type === "LIFT" && challenge.exerciseId) {
    const prs = await prisma.personalRecord.findMany({
      where: {
        userId: { in: userIds },
        exerciseId: challenge.exerciseId,
        type: "WEIGHT",
        ...(challenge.targetReps
          ? { reps: { gte: challenge.targetReps } }
          : {}),
      },
      orderBy: { value: "desc" },
    });
    const byUser = new Map<string, number>();
    for (const pr of prs) {
      if (!byUser.has(pr.userId)) byUser.set(pr.userId, pr.value);
    }
    progress = challenge.participants.map((p) => {
      const v = byUser.get(p.userId) ?? 0;
      return {
        userId: p.userId,
        userName: p.user.name,
        current: v,
        hit: v >= challenge.targetValue,
      };
    });
  } else if (
    challenge.type === "SESSIONS_WEEK" ||
    challenge.type === "VOLUME_WEEK"
  ) {
    const since =
      challenge.createdAt < subDays(new Date(), 7)
        ? subDays(new Date(), 7)
        : challenge.createdAt;
    const workouts = await prisma.workout.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: since },
      },
      include: { exercises: { include: { sets: true } } },
    });
    const statsByUser = new Map<
      string,
      { sessions: number; volume: number }
    >();
    for (const w of workouts) {
      const s = statsByUser.get(w.userId) ?? { sessions: 0, volume: 0 };
      s.sessions += 1;
      s.volume += w.exercises
        .flatMap((e) => e.sets.filter((st) => st.type === "WORKING"))
        .reduce((acc, st) => acc + (st.weight ?? 0) * (st.reps ?? 0), 0);
      statsByUser.set(w.userId, s);
    }
    progress = challenge.participants.map((p) => {
      const s = statsByUser.get(p.userId) ?? { sessions: 0, volume: 0 };
      const v =
        challenge.type === "SESSIONS_WEEK"
          ? s.sessions
          : Math.round(s.volume);
      return {
        userId: p.userId,
        userName: p.user.name,
        current: v,
        hit: v >= challenge.targetValue,
      };
    });
  }

  progress.sort((a, b) => b.current - a.current);

  return { challenge, progress };
}

export async function createCompareCard(input: {
  groupId: string;
  otherUserId: string;
  exerciseId: string;
}) {
  const userId = await requireAuth();
  await assertMember(input.groupId, userId);

  const other = await prisma.groupMember.findFirst({
    where: { groupId: input.groupId, userId: input.otherUserId },
    include: { user: { select: { id: true, name: true } } },
  });
  if (!other) return { error: "That athlete isn't in this group." };

  const [me, them, exercise] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: input.otherUserId },
      select: { id: true, name: true },
    }),
    prisma.exercise.findUnique({ where: { id: input.exerciseId } }),
  ]);
  if (!me || !them || !exercise) return { error: "Data missing." };

  const snapshot = async (uid: string) => {
    const [pr, sessions] = await Promise.all([
      prisma.personalRecord.findFirst({
        where: { userId: uid, exerciseId: input.exerciseId, type: "WEIGHT" },
        orderBy: { value: "desc" },
      }),
      prisma.workoutExercise.findMany({
        where: { exerciseId: input.exerciseId, workout: { userId: uid } },
        include: {
          sets: { where: { type: "WORKING" } },
          workout: { select: { date: true } },
        },
        orderBy: { workout: { date: "desc" } },
        take: 3,
      }),
    ]);
    const lastTopSets = sessions
      .map((s) => {
        if (!s.sets.length) return null;
        const top = s.sets.reduce(
          (b, x) => ((x.weight ?? 0) > (b.weight ?? 0) ? x : b),
          s.sets[0]
        );
        return {
          date: s.workout.date,
          weight: top.weight ?? 0,
          reps: top.reps ?? 0,
        };
      })
      .filter((x): x is { date: Date; weight: number; reps: number } => !!x);
    return {
      pr: pr ? { weight: pr.value, reps: pr.reps ?? 1, date: pr.date } : null,
      lastTopSets,
    };
  };

  const [mine, theirs] = await Promise.all([
    snapshot(userId),
    snapshot(input.otherUserId),
  ]);

  await prisma.groupPost.create({
    data: {
      groupId: input.groupId,
      userId,
      text: "",
      cardType: "COMPARE",
      cardData: {
        exerciseId: input.exerciseId,
        exerciseName: exercise.name,
        me: { id: me.id, name: me.name, ...mine },
        them: { id: them.id, name: them.name, ...theirs },
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/group");
  return { success: true };
}
