import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";

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

  const posts = await prisma.groupPost.findMany({
    where: { groupId },
    include: {
      user: { select: { id: true, name: true } },
      workout: { select: { id: true, title: true, type: true, date: true } },
      challenge: {
        include: {
          exercise: { select: { id: true, name: true } },
          participants: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      },
      comments: {
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      },
      reactions: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Compute live progress for each challenge post
  const challengeIds = posts
    .map((p) => p.challengeId)
    .filter((x): x is string => !!x);

  const progressById = new Map<
    string,
    { userId: string; userName: string; current: number; hit: boolean }[]
  >();

  if (challengeIds.length > 0) {
    const { getChallengeProgress } = await import(
      "@/lib/actions/challenges"
    );
    const results = await Promise.all(
      challengeIds.map((id) => getChallengeProgress(id))
    );
    results.forEach((r, i) => {
      if (r) progressById.set(challengeIds[i], r.progress);
    });
  }

  const enriched = posts.map((p) => ({
    ...p,
    challengeProgress: p.challengeId
      ? progressById.get(p.challengeId) ?? []
      : null,
  }));

  return Response.json({ posts: enriched, currentUserId: userId });
}
