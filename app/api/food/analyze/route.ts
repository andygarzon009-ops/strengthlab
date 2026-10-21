import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { put } from "@vercel/blob";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 120;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// Gemini 503s ("high demand") hit one model at a time — on 2026-10-21 both
// 3.5-flash and flash-latest were down while 3.6-flash and 3.5-flash-lite
// answered — so walk a chain of models verified against this key, each with
// its own timeout so one hung call can't eat the whole function.
const GEMINI_CHAIN: { model: string; timeoutMs: number }[] = [
  { model: "gemini-3.5-flash", timeoutMs: 25_000 },
  { model: "gemini-3.6-flash", timeoutMs: 20_000 },
  { model: "gemini-3.5-flash-lite", timeoutMs: 15_000 },
  { model: "gemini-flash-lite-latest", timeoutMs: 12_000 },
];

export type DetectedFood = {
  name: string;
  portion: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number | null;
};

const PROMPT = `You are a sports nutritionist estimating a meal for a strength athlete's food log.
Identify every distinct food or drink and estimate its portion and nutrition. Be realistic about portion
sizes from visual cues (plate size, utensils, packaging). Prefer slightly over-estimating oils, sauces and
dressings, which people under-count. Split mixed plates into components (e.g. rice, chicken, sauce) when
that makes the numbers more accurate; keep a single packaged item as one item.

Return ONLY JSON in this shape:
{
  "isFood": boolean,
  "items": [
    { "name": string, "portion": string, "kcal": number, "proteinG": number, "carbsG": number, "fatG": number, "fiberG": number | null }
  ],
  "note": string | null
}
- "name": short and plain, e.g. "Grilled chicken breast".
- "portion": human-readable, e.g. "1 breast (~170 g)" or "1 cup cooked".
- Numbers are totals for that portion, rounded to whole numbers.
- "note": one short sentence only if something affects accuracy (e.g. "Sauce hidden under the rice"); else null.
- If the input isn't food, return {"isFood": false, "items": [], "note": "…why…"}.`;

function clean(n: unknown): number {
  const v = typeof n === "number" ? n : parseFloat(String(n));
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

/// Photo or description → estimated foods. Nothing is saved here: the athlete
/// reviews and edits the estimate, then saves it with saveFoodItems. A photo
/// is uploaded so the saved entry can show it.
export async function POST(req: NextRequest) {
  const userId = await requireAuth();
  if (!process.env.GEMINI_API_KEY) {
    return Response.json({ error: "Food detection isn't configured" }, { status: 500 });
  }

  const form = await req.formData();
  const photo = form.get("photo");
  const text = String(form.get("text") ?? "").trim().slice(0, 600);
  const hasPhoto = photo instanceof File && photo.size > 0;
  if (!hasPhoto && !text) {
    return Response.json({ error: "Add a photo or describe what you ate" }, { status: 400 });
  }
  if (hasPhoto && (photo.size > 8 * 1024 * 1024 || !photo.type.startsWith("image/"))) {
    return Response.json({ error: "Use a photo under 8 MB" }, { status: 400 });
  }

  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
    { text: PROMPT },
  ];
  let buffer: Buffer | null = null;
  if (hasPhoto) {
    buffer = Buffer.from(await photo.arrayBuffer());
    parts.push({ inlineData: { mimeType: photo.type, data: buffer.toString("base64") } });
  }
  if (text) parts.push({ text: `The athlete's description: ${text}` });

  const callGemini = (model: string, timeout: number) =>
    genAI
      .getGenerativeModel(
        { model, generationConfig: { responseMimeType: "application/json" } },
        { timeout },
      )
      .generateContent(parts)
      .then((r) => r.response.text().trim());

  // Last resort when every Gemini model is overloaded: Claude reads the same
  // prompt, photo and description.
  const callClaude = async () => {
    if (!anthropic) throw new Error("no Anthropic key");
    const content: Anthropic.ContentBlockParam[] = [];
    if (hasPhoto && buffer) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: (["image/jpeg", "image/png", "image/gif", "image/webp"].includes(photo.type)
            ? photo.type
            : "image/jpeg") as "image/jpeg",
          data: buffer.toString("base64"),
        },
      });
    }
    content.push({
      type: "text",
      text: `${PROMPT}${text ? `\n\nThe athlete's description: ${text}` : ""}\n\nReply with the JSON only.`,
    });
    const r = await anthropic.messages.create(
      { model: "claude-haiku-4-5", max_tokens: 1500, messages: [{ role: "user", content }] },
      { timeout: 25_000 },
    );
    const block = r.content.find((b) => b.type === "text");
    return block && block.type === "text" ? block.text.trim() : "";
  };

  // Upload alongside the estimate so it costs no extra wait.
  const upload =
    hasPhoto && buffer && (process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID)
      ? put(`food/${userId}/${Date.now()}.jpg`, buffer, {
          access: "public",
          contentType: photo.type,
        })
          .then((b) => b.url)
          .catch((e) => {
            console.error("food photo upload failed:", e);
            return null;
          })
      : Promise.resolve(null);

  let raw = "";
  for (const { model, timeoutMs } of GEMINI_CHAIN) {
    try {
      raw = await callGemini(model, timeoutMs);
      if (raw) break;
    } catch (err) {
      console.error(`food analyze ${model} failed:`, err);
    }
  }
  if (!raw) {
    try {
      raw = await callClaude();
    } catch (err) {
      console.error("food analyze claude fallback failed:", err);
    }
  }
  if (!raw) {
    return Response.json(
      { error: "The food AI is overloaded right now — try again in a minute" },
      { status: 502 },
    );
  }

  let parsed: { isFood?: boolean; items?: unknown[]; note?: string | null };
  try {
    const body = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    // Claude may wrap the JSON in a sentence; take the outermost object.
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    parsed = JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body);
  } catch {
    return Response.json({ error: "Couldn't read that meal — try again" }, { status: 502 });
  }

  const items: DetectedFood[] = (Array.isArray(parsed.items) ? parsed.items : [])
    .map((it) => {
      const o = (it ?? {}) as Record<string, unknown>;
      return {
        name: String(o.name ?? "").trim().slice(0, 80),
        portion: String(o.portion ?? "").trim().slice(0, 60),
        kcal: clean(o.kcal),
        proteinG: clean(o.proteinG),
        carbsG: clean(o.carbsG),
        fatG: clean(o.fatG),
        fiberG: o.fiberG == null ? null : clean(o.fiberG),
      };
    })
    .filter((it) => it.name && it.kcal > 0)
    .slice(0, 12);

  const photoUrl = await upload;
  if (parsed.isFood === false || items.length === 0) {
    return Response.json({
      items: [],
      photoUrl,
      note: parsed.note || "Couldn't spot any food in that — try another angle or describe it.",
    });
  }
  return Response.json({ items, photoUrl, note: parsed.note ?? null });
}
