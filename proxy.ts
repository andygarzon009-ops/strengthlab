import { NextRequest, NextResponse } from "next/server";
import { decrypt } from "@/lib/session";

const publicRoutes = ["/login", "/signup"];

export async function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const isPublic = publicRoutes.includes(path);

  const session = req.cookies.get("session")?.value;
  const payload = await decrypt(session);

  if (!payload && !isPublic) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  if (payload && isPublic) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = {
  // Run on app routes only — skip API routes, Next internals, and any path with
  // a file extension (sw.js, manifest.json, icons, images). Auth-gating sw.js
  // was 307-redirecting it to /login, which prevents the service worker from
  // registering and breaks Web Push + rest-timer notifications. Pages still
  // enforce auth server-side via requireAuth(), so this is safe.
  matcher: ["/((?!api|_next/static|_next/image|.*\\.).*)"],
};
