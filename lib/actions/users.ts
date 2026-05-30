"use server";

import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { normalizeUsername, validateUsername } from "@/lib/username";

/// Set or change the signed-in user's username. Enforces format + uniqueness
/// (case-insensitive via normalization).
export async function setUsername(
  raw: string,
): Promise<{ ok?: true; error?: string }> {
  const userId = await requireAuth();
  const err = validateUsername(raw);
  if (err) return { error: err };
  const username = normalizeUsername(raw);

  const taken = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (taken && taken.id !== userId) return { error: "Username already taken" };

  await prisma.user.update({ where: { id: userId }, data: { username } });
  revalidatePath("/profile");
  revalidatePath(`/u/${userId}`);
  return { ok: true };
}

export type SearchFriendState =
  | "none"
  | "outgoing"
  | "incoming"
  | "friends";

export type UserSearchResult = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
  // Current relationship to the searcher, so the UI never shows "Add" for
  // someone already requested or already a friend.
  state: SearchFriendState;
};

/// Search people by username or name for in-app friend requests. Excludes
/// the searcher. Case-insensitive prefix/substring match, capped.
export async function searchUsers(query: string): Promise<UserSearchResult[]> {
  const userId = await requireAuth();
  const q = query.trim().replace(/^@/, "");
  if (q.length < 2) return [];

  const rows = await prisma.user.findMany({
    where: {
      id: { not: userId },
      OR: [
        { username: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, name: true, username: true, image: true },
    take: 12,
  });

  // Resolve the relationship for every result in a few batched queries (rather
  // than per-row), then map in memory. Friendship = a MUTUAL follow.
  const ids = rows.map((r) => r.id);
  const [outEdges, inEdges, pendingReqs] = await Promise.all([
    prisma.follow.findMany({
      where: { followerId: userId, followingId: { in: ids } },
      select: { followingId: true },
    }),
    prisma.follow.findMany({
      where: { followingId: userId, followerId: { in: ids } },
      select: { followerId: true },
    }),
    prisma.friendRequest.findMany({
      where: {
        status: "PENDING",
        OR: [
          { fromUserId: userId, toUserId: { in: ids } },
          { fromUserId: { in: ids }, toUserId: userId },
        ],
      },
      select: { fromUserId: true, toUserId: true },
    }),
  ]);
  const followsOut = new Set(outEdges.map((e) => e.followingId));
  const followsIn = new Set(inEdges.map((e) => e.followerId));
  const outgoing = new Set(
    pendingReqs.filter((r) => r.fromUserId === userId).map((r) => r.toUserId),
  );
  const incoming = new Set(
    pendingReqs.filter((r) => r.toUserId === userId).map((r) => r.fromUserId),
  );
  const stateFor = (id: string): SearchFriendState => {
    if (followsOut.has(id) && followsIn.has(id)) return "friends";
    if (outgoing.has(id)) return "outgoing";
    if (incoming.has(id)) return "incoming";
    return "none";
  };

  // Rank exact/prefix username matches first.
  const ql = q.toLowerCase();
  return rows
    .map((r) => ({ ...r, state: stateFor(r.id) }))
    .sort((a, b) => {
      const ax = a.username?.toLowerCase() ?? "";
      const bx = b.username?.toLowerCase() ?? "";
      const aScore = ax === ql ? 0 : ax.startsWith(ql) ? 1 : 2;
      const bScore = bx === ql ? 0 : bx.startsWith(ql) ? 1 : 2;
      return aScore - bScore;
    });
}
