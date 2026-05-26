import { requireAuth } from "@/lib/session";
import { buildAuthUrl } from "@/lib/googleHealth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "crypto";

export async function GET() {
  // Require login so we know who's connecting before sending them to Google
  await requireAuth();

  // CSRF guard — Google echoes `state` back; we compare to a one-shot cookie
  const state = randomBytes(16).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set("gh_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  redirect(buildAuthUrl(state));
}
