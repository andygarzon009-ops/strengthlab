import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/session";
import bcrypt from "bcryptjs";

type Body = { email?: string; password?: string };

/// Email + password → bearer JWT for native clients (StrengthLab Android app).
/// Returns the same 7-day token the web session uses. The app stores it and
/// sends it as `Authorization: Bearer <token>` on subsequent calls; on 401 it
/// re-authenticates here.
export async function POST(req: Request) {
  const { email, password } = (await req.json()) as Body;
  if (!email || !password) {
    return Response.json({ error: "Missing credentials" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, password: true, name: true },
  });
  // Constant-ish response either way to avoid leaking which emails exist.
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return Response.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const token = await encrypt({ userId: user.id, expiresAt });

  return Response.json({
    token,
    expiresAt: expiresAt.toISOString(),
    user: { id: user.id, name: user.name },
  });
}
