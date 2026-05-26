import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";

export async function POST() {
  const userId = await requireAuth();
  await prisma.healthAccount.deleteMany({ where: { userId } });
  return Response.json({ ok: true });
}
