import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/session";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export async function POST(req: NextRequest) {
  const userId = await requireAuth();

  if (!process.env.GEMINI_API_KEY) {
    return Response.json(
      { error: "Voice is not configured" },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("audio");
  if (!(file instanceof Blob)) {
    return Response.json({ error: "Missing audio" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  // Some browsers send an empty type; default to webm/opus which Chrome
  // and Firefox MediaRecorder produce by default.
  const mimeType = file.type || "audio/webm";

  // Prime Gemini with the user's exercise vocabulary so dictated lift
  // names resolve correctly even when noisy.
  const exerciseNames = await prisma.exercise.findMany({
    where: { OR: [{ ownerId: null }, { ownerId: userId }] },
    select: { name: true },
    orderBy: { name: "asc" },
  });
  const vocab = exerciseNames.map((e) => e.name).join(", ");

  const prompt = `You are transcribing a strength athlete dictating a workout log. Output ONLY the transcript — no commentary, no formatting, no quotes. Reproduce numbers as digits (e.g. "225" not "two twenty-five"). Common lift names you may hear include: ${vocab}.`;

  const tryOnce = async (modelName: string) => {
    const m = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: "text/plain" },
    });
    return m.generateContent([
      { text: prompt },
      { inlineData: { mimeType, data: buffer.toString("base64") } },
    ]);
  };

  let result;
  try {
    result = await tryOnce("gemini-2.5-flash");
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    // Some audio formats (rare) get rejected; surface a clean error.
    if (/unsupported|invalid|format/i.test(msg)) {
      return Response.json(
        { error: "Audio format not supported by transcription" },
        { status: 400 }
      );
    }
    console.error("transcribe error:", err);
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }

  const transcript = result.response.text().trim();
  return Response.json({ transcript });
}
