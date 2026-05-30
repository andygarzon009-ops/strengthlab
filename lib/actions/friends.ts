"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { sendPushToUser } from "@/lib/push";

async function actorName(userId: string): Promise<string> {
  try {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    return u?.name ?? "Someone";
  } catch {
    return "Someone";
  }
}

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

/// Does a directed follow edge a→b exist?
async function followEdge(aId: string, bId: string): Promise<boolean> {
  const f = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId: aId, followingId: bId } },
    select: { id: true },
  });
  return f !== null;
}

/// Are two users actually friends? Friendship is MUTUAL — both follow edges
/// must exist. A lone edge is a legacy one-way follow from the old Strava-style
/// system and must NOT count as friends, or it silently blocks new requests.
async function areMutualFriends(aId: string, bId: string): Promise<boolean> {
  const [out, back] = await Promise.all([
    followEdge(aId, bId),
    followEdge(bId, aId),
  ]);
  return out && back;
}

/// Resolve the relationship between the viewer and another user.
export async function getFriendState(
  viewerId: string,
  otherId: string,
): Promise<FriendState> {
  if (viewerId === otherId) return "self";
  // Friends require a MUTUAL follow (both edges). A legacy one-way follow does
  // not make you friends — fall through so a real request can still be sent.
  if (await areMutualFriends(viewerId, otherId)) return "friends";

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
/// to you, this auto-accepts (both wanted it). Idempotent. Returns the
/// resulting relationship so the UI reflects what actually happened instead of
/// assuming success.
export async function sendFriendRequest(toUserId: string): Promise<FriendState> {
  const userId = await requireAuth();
  if (!toUserId || toUserId === userId) return "self";

  const target = await prisma.user.findUnique({
    where: { id: toUserId },
    select: { id: true },
  });
  if (!target) return "none";

  // Only skip when they're ALREADY mutual friends. A legacy one-way follow
  // (e.g. you followed them under the old system) must NOT short-circuit here,
  // or the request silently never gets created.
  if (await areMutualFriends(userId, toUserId)) return "friends";

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
    // They invited me and I just reciprocated — tell them we're now crew.
    const name = await actorName(userId);
    await sendPushToUser(toUserId, {
      title: "You're now crew 💪",
      body: `${name} added you back`,
      url: "/group",
      tag: "friend-accept",
    });
    return "friends";
  }

  await prisma.friendRequest.upsert({
    where: { fromUserId_toUserId: { fromUserId: userId, toUserId } },
    create: { fromUserId: userId, toUserId, status: "PENDING" },
    update: { status: "PENDING" },
  });
  revalidateAll(toUserId);
  const name = await actorName(userId);
  await sendPushToUser(toUserId, {
    title: "New crew request",
    body: `${name} invited you to join their workout crew`,
    url: "/notifications",
    tag: "friend-request",
  });
  return "outgoing";
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
  // Let the requester know they got in.
  const name = await actorName(userId);
  await sendPushToUser(fromUserId, {
    title: "You're now crew 💪",
    body: `${name} accepted your crew request`,
    url: "/group",
    tag: "friend-accept",
  });
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
