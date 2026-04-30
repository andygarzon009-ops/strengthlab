"use server";

import { prisma } from "@/lib/db";
import { createSession, deleteSession, getSession } from "@/lib/session";
import { DEFAULT_EXERCISES } from "@/lib/exercises";
import { sendEmail } from "@/lib/email";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

type AuthState = { error: string } | undefined;
type FormState = { error?: string; success?: string } | undefined;

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function appBaseUrl() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export async function signup(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!name || !email || !password) {
    return { error: "All fields are required" };
  }
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "Email already in use" };

  const hashed = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, password: hashed },
  });

  // Seed default exercises if none exist
  const count = await prisma.exercise.count();
  if (count === 0) {
    await prisma.exercise.createMany({ data: DEFAULT_EXERCISES });
  }

  await createSession(user.id);
  redirect("/");
}

export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) return { error: "All fields are required" };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { error: "Invalid email or password" };

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return { error: "Invalid email or password" };

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email) return { error: "Enter your email" };

  const user = await prisma.user.findUnique({ where: { email } });

  // Generic response either way to avoid leaking which emails exist.
  const success = "If an account exists for that email, a reset link is on its way.";

  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const link = `${await appBaseUrl()}/reset-password?token=${token}`;
    await sendEmail({
      to: email,
      subject: "Reset your StrengthLab password",
      text:
        `Hey ${user.name},\n\n` +
        `Reset your StrengthLab password using the link below. It expires in 1 hour.\n\n` +
        `${link}\n\n` +
        `If you didn't request this, you can ignore this email.`,
    });
  }

  return { success };
}

export async function resetPassword(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const token = formData.get("token") as string;
  const password = formData.get("password") as string;
  const confirm = formData.get("confirm") as string;

  if (!token) return { error: "Missing reset token" };
  if (!password || password.length < 6)
    return { error: "Password must be at least 6 characters" };
  if (password !== confirm) return { error: "Passwords don't match" };

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return { error: "This reset link is invalid or has expired" };
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { password: hashed },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other outstanding tokens for this user.
    prisma.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null, id: { not: record.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  await deleteSession();
  redirect("/login?reset=1");
}

export async function changePassword(
  _prev: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await getSession();
  if (!session?.userId) return { error: "Not signed in" };

  const currentPassword = formData.get("currentPassword") as string;
  const newPassword = formData.get("newPassword") as string;
  const confirm = formData.get("confirm") as string;

  if (!currentPassword || !newPassword)
    return { error: "All fields are required" };
  if (newPassword.length < 6)
    return { error: "New password must be at least 6 characters" };
  if (newPassword !== confirm) return { error: "Passwords don't match" };

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return { error: "Account not found" };

  const valid = await bcrypt.compare(currentPassword, user.password);
  if (!valid) return { error: "Current password is incorrect" };

  if (await bcrypt.compare(newPassword, user.password)) {
    return { error: "New password must be different" };
  }

  const hashed = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed },
  });

  return { success: "Password updated" };
}
