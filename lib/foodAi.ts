// Shared by the food routes. Gemini 503s ("high demand") hit one model at a
// time — on 2026-10-21 both 3.5-flash and flash-latest were down while
// 3.6-flash and 3.5-flash-lite answered — so walk a chain of models verified
// against this key, each with its own timeout so one hung call can't eat the
// whole function.
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const GEMINI_CHAIN: { model: string; timeoutMs: number }[] = [
  { model: "gemini-3.5-flash", timeoutMs: 25_000 },
  { model: "gemini-3.6-flash", timeoutMs: 20_000 },
  { model: "gemini-3.5-flash-lite", timeoutMs: 15_000 },
  { model: "gemini-flash-lite-latest", timeoutMs: 12_000 },
];

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

/// A text-only prompt → parsed JSON, through the Gemini chain and then
/// Claude. Null when every model failed or the reply wasn't JSON.
export async function textToJson<T>(prompt: string, label: string): Promise<T | null> {
  let raw = "";
  for (const { model, timeoutMs } of GEMINI_CHAIN) {
    try {
      raw = await genAI
        .getGenerativeModel(
          { model, generationConfig: { responseMimeType: "application/json" } },
          { timeout: timeoutMs },
        )
        .generateContent(prompt)
        .then((r) => r.response.text().trim());
      if (raw) break;
    } catch (err) {
      console.error(`${label} ${model} failed:`, err);
    }
  }
  if (!raw && anthropic) {
    try {
      const r = await anthropic.messages.create(
        { model: "claude-haiku-4-5", max_tokens: 3000, messages: [{ role: "user", content: prompt }] },
        { timeout: 25_000 },
      );
      const block = r.content.find((b) => b.type === "text");
      raw = block && block.type === "text" ? block.text.trim() : "";
    } catch (err) {
      console.error(`${label} claude fallback failed:`, err);
    }
  }
  if (!raw) return null;
  try {
    const body = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    // Claude may wrap the JSON in a sentence; take the outermost object.
    const start = body.indexOf("{");
    const end = body.lastIndexOf("}");
    return JSON.parse(start >= 0 && end > start ? body.slice(start, end + 1) : body) as T;
  } catch {
    return null;
  }
}
