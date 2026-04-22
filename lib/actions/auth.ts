"use server";

import { prisma } from "@/lib/db";
import { createSession, deleteSession } from "@/lib/session";
import { DEFAULT_EXERCISES } from "@/lib/exercises";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";

type AuthState = { error: string } | undefined;

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
