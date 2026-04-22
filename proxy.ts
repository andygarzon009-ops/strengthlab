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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
