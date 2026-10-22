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

/// Claude models for text JSON, newest first. A model this key can't use
/// fails fast (404) and the next one answers.
const CLAUDE_CHAIN = ["claude-haiku-5-5", "claude-haiku-4-5"];

async function claudeText(prompt: string, label: string): Promise<string> {
  if (!anthropic) {
    console.warn(`${label}: ANTHROPIC_API_KEY not set, skipping Claude`);
    return "";
  }
  for (const model of CLAUDE_CHAIN) {
    try {
      const r = await anthropic.messages.create(
        { model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] },
        { timeout: 40_000 },
      );
      const block = r.content.find((b) => b.type === "text");
      const text = block && block.type === "text" ? block.text.trim() : "";
      if (text) {
        console.info(`${label} answered by ${model}`);
        return text;
      }
    } catch (err) {
      console.error(`${label} ${model} failed:`, err);
    }
  }
  return "";
}

async function geminiText(prompt: string, label: string): Promise<string> {
  for (const { model, timeoutMs } of GEMINI_CHAIN) {
    try {
      const raw = await genAI
        .getGenerativeModel(
          { model, generationConfig: { responseMimeType: "application/json" } },
          { timeout: timeoutMs },
        )
        .generateContent(prompt)
        .then((r) => r.response.text().trim());
      if (raw) {
        console.info(`${label} answered by ${model}`);
        return raw;
      }
    } catch (err) {
      console.error(`${label} ${model} failed:`, err);
    }
  }
  return "";
}

/// A text-only prompt → parsed JSON. Gemini first and Claude as the backstop
/// by default; `claudeFirst` flips that (recipes, where quality matters more
/// than the few cents). Null when every model failed or the reply wasn't JSON.
export async function textToJson<T>(
  prompt: string,
  label: string,
  { claudeFirst = false }: { claudeFirst?: boolean } = {},
): Promise<T | null> {
  const raw = claudeFirst
    ? (await claudeText(prompt, label)) || (await geminiText(prompt, label))
    : (await geminiText(prompt, label)) || (await claudeText(prompt, label));
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
