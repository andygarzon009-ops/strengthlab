import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";
import { listUnmatchedFitbitSessions } from "@/lib/fitbitDetect";

export async function GET() {
  const userId = await requireAuth();
  const account = await prisma.healthAccount.findUnique({ where: { userId } });
  if (!account) {
    return Response.json({ connected: false, sessions: [] });
  }
  try {
    const sessions = await listUnmatchedFitbitSessions(userId);
    return Response.json({ connected: true, sessions });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ connected: true, error: msg, sessions: [] }, { status: 502 });
  }
}
