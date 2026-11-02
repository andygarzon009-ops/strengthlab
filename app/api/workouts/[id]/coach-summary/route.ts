import { requireAuth } from "@/lib/session";
import { coachSummaryFor } from "@/lib/workoutSummary";

export const maxDuration = 60;

/// The coach's short take on a logged session (writes it on first ask).
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth();
  const { id } = await ctx.params;
  const summary = await coachSummaryFor(id, userId);
  return Response.json({ summary });
}
