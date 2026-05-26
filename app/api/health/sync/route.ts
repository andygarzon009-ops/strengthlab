import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listExercise } from "@/lib/googleHealth";

export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) {
    return Response.json({ connected: false }, { status: 200 });
  }

  // Last 7 days. The Health API filter uses civil_start_time (local-naive).
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19);

  try {
    const exercise = await listExercise(userId, since);
    return Response.json({ connected: true, exercise });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ connected: true, error: msg }, { status: 502 });
  }
}
