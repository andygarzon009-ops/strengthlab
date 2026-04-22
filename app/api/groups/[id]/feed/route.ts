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

  return Response.json({ posts, currentUserId: userId });
}
