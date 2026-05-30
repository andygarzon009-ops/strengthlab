"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";

export type FriendState =
  | "self"
  | "none"
  | "outgoing" // I sent a pending request
  | "incoming" // they sent me a pending request
  | "friends";

function revalidateAll(otherId: string) {
  revalidatePath("/group");
  revalidatePath("/");
  revalidatePath(`/u/${otherId}`);
}

/// Resolve the relationship between the viewer and another user.
export async function getFriendState(
  viewerId: string,
  otherId: string,
): Promise<FriendState> {
  if (viewerId === otherId) return "self";
  // Friends = a follow edge from viewer → other (created mutually on accept).
  const follow = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: viewerId, followingId: otherId },
    },
    select: { id: true },
  });
  if (follow) return "friends";

  const reqs = await prisma.friendRequest.findMany({
    where: {
      status: "PENDING",
      OR: [
        { fromUserId: viewerId, toUserId: otherId },
        { fromUserId: otherId, toUserId: viewerId },
      ],
    },
    select: { fromUserId: true },
  });
  if (reqs.some((r) => r.fromUserId === viewerId)) return "outgoing";
  if (reqs.some((r) => r.fromUserId === otherId)) return "incoming";
  return "none";
}

async function makeFriends(aId: string, bId: string) {
  // Mutual follow edges — a friendship is symmetric.
  await prisma.$transaction([
    prisma.follow.upsert({
      where: { followerId_followingId: { followerId: aId, followingId: bId } },
      create: { followerId: aId, followingId: bId },
      update: {},
    }),
    prisma.follow.upsert({
      where: { followerId_followingId: { followerId: bId, followingId: aId } },
      create: { followerId: bId, followingId: aId },
      update: {},
    }),
  ]);
}

/// Send a friend request. If the other person already has a pending request
/// to you, this auto-accepts (both wanted it). Idempotent.
export async function sendFriendRequest(toUserId: string) {
  const userId = await requireAuth();
  if (!toUserId || toUserId === userId) return;

  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true },
  });
  if (!target) return;

  // Already friends?
  const already = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: userId, followingId: toUserId },
    },
    select: { id: true },
  });
  if (already) return;

  // They already invited me → accept instead of creating a reverse request.
  const reverse = await prisma.friendRequest.findUnique({
    where: { fromUserId_toUserId: { fromUserId: toUserId, toUserId: userId } },
    select: { id: true, status: true },
  });
  if (reverse && reverse.status === "PENDING") {
    await makeFriends(userId, toUserId);
    await prisma.friendRequest.update({
      where: { id: reverse.id },
      data: { status: "ACCEPTED" },
    });
    revalidateAll(toUserId);
    return;
  }

  await prisma.friendRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId } },
    create: { fromUserId: userId, toUserId, status: "PENDING" },
    update: { status: "PENDING" },
  });
  revalidateAll(toUserId);
}

/// Accept a pending incoming request (by the requester's id).
export async function acceptFriendRequest(fromUserId: string) {
  const userId = await requireAuth();
  const req = await prisma.friendRequest.findUnique({
    where: { fromUserId_toUserId: { fromUserId, toUserId: userId } },
    select: { id: true, status: true },
  });
  if (!req || req.status !== "PENDING") return;
  await makeFriends(userId, fromUserId);
  await prisma.friendRequest.update({
    where: { id: req.id },
    data: { status: "ACCEPTED" },
  });
  revalidateAll(fromUserId);
}

/// Decline an incoming request.
export async function declineFriendRequest(fromUserId: string) {
  const userId = await requireAuth();
  await prisma.friendRequest.updateMany({
    where: { fromUserId, toUserId: userId, status: "PENDING" },
    data: { status: "DECLINED" },
  });
  revalidateAll(fromUserId);
}

/// Cancel a request I sent.
export async function cancelFriendRequest(toUserId: string) {
  const userId = await requireAuth();
  await prisma.friendRequest.deleteMany({
    where: { fromUserId: userId, toUserId, status: "PENDING" },
  });
  revalidateAll(toUserId);
}

/// Remove a friend — drops both follow edges and any request history so a
/// fresh request can be sent later.
export async function unfriend(otherId: string) {
  const userId = await requireAuth();
  await prisma.$transaction([
    prisma.follow.deleteMany({
      where: { followerId: userId, followingId: otherId },
    }),
    prisma.follow.deleteMany({
      where: { followerId: otherId, followingId: userId },
    }),
    prisma.friendRequest.deleteMany({
      where: {
        OR: [
          { fromUserId: userId, toUserId: otherId },
          { fromUserId: otherId, toUserId: userId },
        ],
      },
    }),
  ]);
  revalidateAll(otherId);
}
