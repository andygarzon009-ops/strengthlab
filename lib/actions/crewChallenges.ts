"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import type { ChallengeType } from "@/lib/crewChallenges";

export async function createChallenge(input: {
  name: string;
  type: ChallengeType;
  exerciseId?: string | null;
  targetValue?: number | null;
  targetReps?: number | null;
  endsAt?: string | null;
  memberIds: string[];
}): Promise<{ id?: string; error?: string }> {
  const userId = await requireAuth();
  const name = input.name.trim();
  if (!name) return { error: "Name required" };

  // You can only invite people you follow.
  const follows = await prisma.follow.findMany({
    where: { followerId: userId },
    select: { followingId: true },
  });
  const allowed = new Set(follows.map((f) => f.followingId));
  const members = [
    ...new Set([userId, ...input.memberIds.filter((id) => allowed.has(id))]),
  ];

  const ch = await prisma.crewChallenge.create({
    data: {
      creatorId: userId,
      name,
      type: input.type,
      exerciseId: input.type === "LIFT_RACE" ? (input.exerciseId ?? null) : null,
      targetValue: input.targetValue ?? null,
      targetReps: input.targetReps ?? null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      members: { create: members.map((uid) => ({ userId: uid })) },
    },
  });

  revalidatePath("/group");
  revalidatePath("/group/challenges");
  return { id: ch.id };
}

export async function joinChallenge(id: string) {
  const userId = await requireAuth();
  await prisma.crewChallengeMember.upsert({
    where: { challengeId_userId: { challengeId: id, userId } },
    create: { challengeId: id, userId },
    update: {},
  });
  revalidatePath("/group");
  revalidatePath(`/group/challenges/${id}`);
}

/// Leave a challenge. If the creator leaves, the whole challenge is removed
/// (no orphaned challenge with no owner).
export async function leaveChallenge(id: string) {
  const userId = await requireAuth();
  const ch = await prisma.crewChallenge.findUnique({
    where: { id },
    select: { creatorId: true },
  });
  if (ch?.creatorId === userId) {
    await prisma.crewChallenge.delete({ where: { id } });
  } else {
    await prisma.crewChallengeMember.deleteMany({
      where: { challengeId: id, userId },
    });
  }
  revalidatePath("/group");
  revalidatePath("/group/challenges");
}

export async function deleteChallenge(id: string) {
  const userId = await requireAuth();
  await prisma.crewChallenge.deleteMany({ where: { id, creatorId: userId } });
  revalidatePath("/group");
  revalidatePath("/group/challenges");
}
