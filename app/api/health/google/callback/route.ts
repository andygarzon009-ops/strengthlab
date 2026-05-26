import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { exchangeCodeForTokens } from "@/lib/googleHealth";
import { prisma } from "@/lib/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function GET(req: NextRequest) {
  const userId = await requireAuth();
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    redirect(`/health?error=${encodeURIComponent(error)}`);
  }

  const cookieStore = await cookies();
  const expectedState = cookieStore.get("gh_oauth_state")?.value;
  cookieStore.delete("gh_oauth_state");

  if (!code || !state || state !== expectedState) {
    redirect("/health?error=invalid_state");
  }

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    // Without a refresh token we'd lose access in an hour. prompt=consent in
    // the auth URL guarantees one, so getting here means something's wrong.
    redirect("/health?error=no_refresh_token");
  }

  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await prisma.healthAccount.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      expiresAt,
      scope: tokens.scope,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token!,
      expiresAt,
      scope: tokens.scope,
    },
  });

  redirect("/health?connected=1");
}
