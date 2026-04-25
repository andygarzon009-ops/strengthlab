"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "Push day. Bench press 3 sets of 225 for 5. Incline dumbbell press 4 sets of 65 for 10. Lateral raises 3 sets of 25 for 15.",
  "Ran 8 kilometers in 42 minutes.",
  "Pull day. Weighted pull-ups 4 sets of 70 for 6. Chest supported rows 3 sets of 80 for 10.",
];

type Stage = "idle" | "recording" | "transcribing" | "parsing";

export default function VoiceLogger() {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      typeof navigator.mediaDevices?.getUserMedia === "function" &&
      typeof window.MediaRecorder !== "undefined";
    setSupported(ok);
  }, []);

  // Pick the highest-quality container the browser actually supports.
  // Chrome/Firefox prefer webm/opus, iOS Safari falls back to mp4/aac.
  const pickMimeType = () => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ];
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c)) return c;
    }
    return "";
  };

  const start = async () => {
    setError("");
    setTranscript("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const rec = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const type = rec.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        await transcribe(blob);
      };
      rec.start();
      recorderRef.current = rec;
      setStage("recording");
    } catch (e) {
      setError(
        e instanceof Error && e.name === "NotAllowedError"
          ? "Mic permission denied — enable it in your browser settings."
          : "Couldn't start the mic."
      );
      setStage("idle");
    }
  };

  const stop = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setStage("transcribing");
  };

  const transcribe = async (blob: Blob) => {
    try {
      const form = new FormData();
      form.append("audio", blob, "voice.webm");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Transcription failed");
      setTranscript((body.transcript ?? "").trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setStage("idle");
    }
  };

  const parseAndGo = async () => {
    if (stage === "recording") stop();
    const text = transcript.trim();
    if (!text) return;
    setStage("parsing");
    setError("");
    try {
      const res = await fetch("/api/voice-parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Parse failed");
      sessionStorage.setItem("sl:voiceDraft", JSON.stringify(body.draft));
      router.push("/log?voice=1");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
      setStage("idle");
    }
  };

  const recording = stage === "recording";
  const transcribing = stage === "transcribing";
  const parsing = stage === "parsing";
  const busy = transcribing || parsing;

  let micLabel = "Tap to start";
  if (recording) micLabel = "Listening — tap to stop";
  else if (transcribing) micLabel = "Transcribing…";
  else if (!supported) micLabel = "Voice not supported — type below";

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="mb-6">
        <p className="label">Voice log</p>
        <h1 className="text-[26px] font-bold tracking-tight leading-none mt-1">
          Just say it
        </h1>
        <p
          className="text-[13px] mt-2"
          style={{ color: "var(--fg-muted)" }}
        >
          Talk your workout. I&apos;ll turn it into sets, weights, and reps —
          you just review and save.
        </p>
      </div>

      <div
        className="card p-6 mb-5 text-center"
        style={{
          background:
            "linear-gradient(180deg, rgba(34,197,94,0.08) 0%, var(--bg-card) 80%)",
          border: "1px solid rgba(34,197,94,0.2)",
        }}
      >
        <button
          onClick={recording ? stop : start}
          disabled={(!supported && !recording) || busy}
          className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-3 transition-transform active:scale-95"
          style={{
            background: recording ? "#ef4444" : "var(--accent)",
            color: "#0a0a0a",
            boxShadow: recording
              ? "0 0 0 10px rgba(239,68,68,0.15)"
              : "0 12px 32px -8px rgba(34,197,94,0.6)",
            opacity: busy ? 0.5 : 1,
          }}
          aria-label={recording ? "Stop listening" : "Start listening"}
        >
          {recording ? (
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          ) : (
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <path d="M12 17v5" />
            </svg>
          )}
        </button>
        <p
          className="text-[12px] label"
          style={{
            color: recording
              ? "#f87171"
              : transcribing
              ? "var(--accent)"
              : "var(--fg-dim)",
          }}
        >
          {micLabel}
        </p>
      </div>

      <textarea
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
        placeholder="…or type it: “Push day. Bench press 3 sets of 225 for 5. Incline DB press 4 of 65 for 10.”"
        rows={4}
        className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none resize-none mb-3"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
        }}
      />

      {error && (
        <p className="text-[12px] mb-3" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <button
        onClick={parseAndGo}
        disabled={!transcript.trim() || busy}
        className="btn-accent w-full py-3.5 rounded-xl text-[14px] font-semibold mb-5"
      >
        {parsing ? "Parsing your workout…" : "Parse & review"}
      </button>

      <div className="card p-4" style={{ background: "var(--bg-elevated)" }}>
        <p
          className="label text-[10px] mb-2"
          style={{ color: "var(--fg-dim)" }}
        >
          Try saying
        </p>
        <div className="space-y-2">
          {EXAMPLES.map((ex, i) => (
            <button
              key={i}
              onClick={() => setTranscript(ex)}
              className="w-full text-left text-[12px] px-3 py-2 rounded-lg"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
              }}
            >
              &ldquo;{ex}&rdquo;
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
