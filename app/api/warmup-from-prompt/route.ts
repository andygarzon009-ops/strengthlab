import { NextRequest } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { requireAuth } from "@/lib/session";
import {
  WARMUP_SPLIT_KEYS,
  type WarmupSplitKey,
  type WarmupItem,
} from "@/lib/warmupPreferences";

export const maxDuration = 30;

const SPLIT_LABEL: Record<WarmupSplitKey, string> = {
  PUSH: "push (chest/shoulders/triceps)",
  PULL: "pull (back/biceps/rear delts)",
  LEGS: "legs (quads/hamstrings/glutes/calves)",
  UPPER: "upper body",
  LOWER: "lower body",
  ARMS: "arms (biceps/triceps)",
  FULL_BODY: "full body",
  CORE: "core",
};

const VALID_KINDS = new Set(["cardio", "mobility", "activation"]);

function sanitize(parsed: unknown): WarmupItem[] {
  if (!Array.isArray(parsed)) return [];
  const out: WarmupItem[] = [];
  for (const r of parsed) {
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
    } else if (typeof o.durationMin === "number" && o.durationMin > 0) {
      durationSec = Math.min(600, Math.max(1, Math.round(o.durationMin * 60)));
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

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    if (!process.env.GEMINI_API_KEY) {
      return Response.json({ error: "AI not configured" }, { status: 500 });
    }
    const body = (await req.json()) as { prompt?: string; split?: string };
    const prompt = (body.prompt ?? "").trim();
    if (!prompt) {
      return Response.json({ error: "Prompt is required" }, { status: 400 });
    }
    const split = WARMUP_SPLIT_KEYS.includes(body.split as WarmupSplitKey)
      ? (body.split as WarmupSplitKey)
      : null;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
      },
    });

    const splitContext = split
      ? `The athlete is configuring their warm-up for ${SPLIT_LABEL[split]} days.`
      : "";

    const system = `You convert an athlete's free-text warm-up description into a JSON array of warm-up items. ${splitContext}

Return ONLY a JSON array (no prose, no markdown fence). Each item:
{
  "kind": "cardio" | "mobility" | "activation",   // pick the best fit
  "name": string,                                  // ≤ 80 chars
  "durationSec": integer seconds (optional),       // for timed items (cardio, holds)
  "reps": integer (optional),                      // for counted items (drills, activations)
  "instructions": string ≤ 200 chars (optional)
}

Rules:
- Every item MUST have EITHER durationSec OR reps (or both — but pick the most natural). Items with neither are useless.
- Kind hints: cardio = bike/treadmill/rope/jog. mobility = dynamic stretches, joint prep, foam roll. activation = band pull-aparts, glute bridges, scapular work, light primer reps.
- Convert minutes to seconds in durationSec (5 min → 300).
- If the athlete says "until warm" or "AMRAP", pick a sensible default (cardio: 180s, drills: 10 reps).
- Max 10 items. Total durationSec across the whole array should stay under 600.
- Order: cardio first, then mobility, then activation.

Athlete's prompt:
${prompt}`;

    const resp = await model.generateContent(system);
    const text = resp.response.text();

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Try to recover a bare array from the text in case the model wrapped it.
      const m = text.match(/\[[\s\S]*\]/);
      if (m) {
        try {
          parsed = JSON.parse(m[0]);
        } catch {
          return Response.json(
            { error: "Could not parse AI response" },
            { status: 502 },
          );
        }
      } else {
        return Response.json(
          { error: "Could not parse AI response" },
          { status: 502 },
        );
      }
    }

    const items = sanitize(parsed);
    if (items.length === 0) {
      return Response.json(
        { error: "AI didn't produce any usable warm-up items. Try a more specific prompt." },
        { status: 422 },
      );
    }
    return Response.json({ items });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json({ error: msg }, { status: 500 });
  }
}
