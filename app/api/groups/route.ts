import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";

export async function GET() {
  const userId = await requireAuth();
  const memberships = await prisma.groupMember.findMany({
    where: { userId },
    include: {
      group: {
        include: {
          members: { include: { user: { select: { id: true, name: true } } } },
        },
      },
    },
  });
  const groups = memberships.map((m) => m.group);
  return Response.json(groups);
}
