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

export type UserSearchResult = {
  id: string;
  name: string;
  username: string | null;
  image: string | null;
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

  // Rank exact/prefix username matches first.
  const ql = q.toLowerCase();
  return rows.sort((a, b) => {
    const ax = a.username?.toLowerCase() ?? "";
    const bx = b.username?.toLowerCase() ?? "";
    const aScore = ax === ql ? 0 : ax.startsWith(ql) ? 1 : 2;
    const bScore = bx === ql ? 0 : bx.startsWith(ql) ? 1 : 2;
    return aScore - bScore;
  });
}
