"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/session";
import type { Prisma } from "@/app/generated/prisma";
import {
  WARMUP_SPLIT_KEYS,
  type WarmupItem,
  type WarmupSplitKey,
  type PreferredWarmups,
} from "@/lib/warmupPreferences";

const VALID_KINDS = new Set(["cardio", "mobility", "activation"]);

// Coerce arbitrary JSON into the canonical WarmupItem shape. Items missing
// both a duration and a rep target are dropped — a warmup with no concrete
// dosage isn't actionable.
function sanitizeItems(raw: unknown): WarmupItem[] {
  if (!Array.isArray(raw)) return [];
  const out: WarmupItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim().slice(0, 80) : "";
    if (!name) continue;
    const kind =
      typeof o.kind === "string" && VALID_KINDS.has(o.kind)
        ? (o.kind as WarmupItem["kind"])
        : undefined;
    let durationSec: number | undefined;
    if (typeof o.durationSec === "number" && o.durationSec > 0) {
      durationSec = Math.min(600, Math.max(1, Math.round(o.durationSec)));
    }
    let reps: number | undefined;
    if (typeof o.reps === "number" && o.reps > 0) {
      reps = Math.min(100, Math.max(1, Math.round(o.reps)));
    }
    if (!durationSec && !reps) continue;
    const instructions =
      typeof o.instructions === "string"
        ? o.instructions.slice(0, 200)
        : undefined;
    out.push({ kind, name, durationSec, reps, instructions });
  }
  return out.slice(0, 12);
}

export async function loadPreferredWarmups(): Promise<PreferredWarmups> {
  const userId = await requireAuth();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredWarmups: true },
  });
  const raw = u?.preferredWarmups;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: PreferredWarmups = {};
  for (const key of WARMUP_SPLIT_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    const items = sanitizeItems(value);
    if (items.length) out[key] = items;
  }
  return out;
}

export async function savePreferredWarmupsForSplit(
  split: WarmupSplitKey,
  items: WarmupItem[],
) {
  const userId = await requireAuth();
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { preferredWarmups: true },
  });
  const current: Record<string, unknown> =
    u?.preferredWarmups && typeof u.preferredWarmups === "object" && !Array.isArray(u.preferredWarmups)
      ? { ...(u.preferredWarmups as Record<string, unknown>) }
      : {};
  const clean = sanitizeItems(items);
  if (clean.length === 0) {
    delete current[split];
  } else {
    current[split] = clean;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { preferredWarmups: current as Prisma.InputJsonValue },
  });
  revalidatePath("/profile");
  revalidatePath("/profile/warmups");
}
