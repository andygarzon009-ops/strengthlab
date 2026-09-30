import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

const secretKey = process.env.SESSION_SECRET;
const encodedKey = new TextEncoder().encode(secretKey);

type SessionPayload = {
  userId: string;
  expiresAt: Date;
  iat?: number;
};

// Sliding session: proxy.ts re-issues the cookie once a day while the app is
// in use, so only 30 days of not opening it signs you out. A fixed 7-day
// session expired mid-workout and the Finish save came back as the login page.
const SESSION_DAYS = 30;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export function sessionCookie(value: string, expiresAt: Date) {
  return {
    name: "session",
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function issueSession(userId: string) {
  const expiresAt = new Date(Date.now() + SESSION_MS);
  return sessionCookie(await encrypt({ userId, expiresAt }), expiresAt);
}

export async function encrypt(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(encodedKey);
}

export async function decrypt(session: string | undefined = "") {
  try {
    const { payload } = await jwtVerify(session, encodedKey, {
      algorithms: ["HS256"],
    });
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

export async function createSession(userId: string) {
  const cookieStore = await cookies();
  cookieStore.set(await issueSession(userId));
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
}

export async function getSession() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session")?.value;
  return decrypt(session);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.userId) redirect("/login");
  return session.userId;
}
