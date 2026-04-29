import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";

// Lightweight endpoint the dashboard hits on mount with the user's
// IANA timezone (e.g. "America/Toronto"). We only persist it when it
// has actually changed so a returning user costs at most one update.
export async function POST(req: Request) {
  const userId = await requireAuth();
  const { timezone } = (await req.json().catch(() => ({}))) as {
    timezone?: string;
  };

  if (typeof timezone !== "string" || timezone.length < 2 || timezone.length > 64) {
    return Response.json({ error: "invalid timezone" }, { status: 400 });
  }

  // Reject anything that isn't a recognized IANA zone — guards against
  // a malformed client sending arbitrary strings into the column.
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date());
  } catch {
    return Response.json({ error: "unknown timezone" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  if (existing?.timezone === timezone) {
    return Response.json({ ok: true, unchanged: true });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { timezone },
  });
  return Response.json({ ok: true });
}
