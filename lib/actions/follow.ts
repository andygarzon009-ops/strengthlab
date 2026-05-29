"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

/// Follow another athlete (one-way, no accept step). Idempotent — following
/// someone you already follow is a no-op. You can't follow yourself.
export async function followUser(targetUserId: string) {
  const userId = await requireAuth();
  if (!targetUserId || targetUserId === userId) return;

  // Make sure the target exists before creating the edge.
  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!target) return;

  await prisma.follow.upsert({
    where: {
      followerId_followingId: { followerId: userId, followingId: targetUserId },
    },
    create: { followerId: userId, followingId: targetUserId },
    update: {},
  });

  revalidatePath("/group");
  revalidatePath("/");
  revalidatePath(`/u/${targetUserId}`);
}

export async function unfollowUser(targetUserId: string) {
  const userId = await requireAuth();
  await prisma.follow.deleteMany({
    where: { followerId: userId, followingId: targetUserId },
  });

  revalidatePath("/group");
  revalidatePath("/");
  revalidatePath(`/u/${targetUserId}`);
}
