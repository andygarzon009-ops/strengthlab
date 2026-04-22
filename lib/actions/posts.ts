"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

async function assertMember(groupId: string, userId: string) {
  const m = await prisma.groupMember.findFirst({
    where: { groupId, userId },
  });
  if (!m) throw new Error("Not a member of this group");
  return m;
}

export async function createGroupPost(input: {
  groupId: string;
  text: string;
  imageUrl?: string;
  workoutId?: string;
}) {
  const userId = await requireAuth();
  await assertMember(input.groupId, userId);
  const text = input.text.trim();
  if (!text && !input.imageUrl && !input.workoutId) {
    return { error: "Write something, attach a photo, or link a workout." };
  }
  await prisma.groupPost.create({
    data: {
      groupId: input.groupId,
      userId,
      text: text || "",
      imageUrl: input.imageUrl,
      workoutId: input.workoutId,
    },
  });
  revalidatePath("/group");
  return { success: true };
}

export async function deleteGroupPost(postId: string) {
  const userId = await requireAuth();
  const post = await prisma.groupPost.findUnique({ where: { id: postId } });
  if (!post) return { error: "Post not found" };
  if (post.userId !== userId) {
    const membership = await prisma.groupMember.findFirst({
      where: { groupId: post.groupId, userId, role: "ADMIN" },
    });
    if (!membership) return { error: "Not allowed" };
  }
  await prisma.groupPost.delete({ where: { id: postId } });
  revalidatePath("/group");
  return { success: true };
}

export async function addPostComment(postId: string, text: string) {
  const userId = await requireAuth();
  const trimmed = text.trim();
  if (!trimmed) return;
  const post = await prisma.groupPost.findUnique({ where: { id: postId } });
  if (!post) return;
  await assertMember(post.groupId, userId);
  await prisma.postComment.create({
    data: { postId, userId, text: trimmed },
  });
  revalidatePath("/group");
}

export async function togglePostReaction(postId: string, type: string) {
  const userId = await requireAuth();
  const post = await prisma.groupPost.findUnique({ where: { id: postId } });
  if (!post) return;
  await assertMember(post.groupId, userId);
  const existing = await prisma.postReaction.findFirst({
    where: { postId, userId, type },
  });
  if (existing) {
    await prisma.postReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.postReaction.create({ data: { postId, userId, type } });
  }
  revalidatePath("/group");
}
