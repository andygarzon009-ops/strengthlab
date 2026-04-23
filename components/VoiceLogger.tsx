"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type SR = {
  new (): {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start: () => void;
    stop: () => void;
    onresult: (e: { results: { [i: number]: { [i: number]: { transcript: string } }; length: number } }) => void;
    onerror: (e: { error?: string }) => void;
    onend: () => void;
  };
};

const EXAMPLES = [
  "Push day. Bench press 3 sets of 225 for 5. Incline dumbbell press 4 sets of 65 for 10. Lateral raises 3 sets of 25 for 15.",
  "Ran 8 kilometers in 42 minutes.",
  "Pull day. Weighted pull-ups 4 sets of 70 for 6. Chest supported rows 3 sets of 80 for 10.",
];

export default function VoiceLogger() {
  const router = useRouter();
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const [parsing, setParsing] = useState(false);
  const recRef = useRef<ReturnType<InstanceType<SR>["start"]> extends void ? InstanceType<SR> : never>(
    null as unknown as InstanceType<SR>
  );

  useEffect(() => {
    const win = window as unknown as {
      SpeechRecognition?: SR;
      webkitSpeechRecognition?: SR;
    };
    const SRClass = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (SRClass) setSupported(true);
  }, []);

  const start = () => {
    setError("");
    setTranscript("");
    const win = window as unknown as {
      SpeechRecognition?: SR;
      webkitSpeechRecognition?: SR;
    };
    const SRClass = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SRClass) {
      setError("Your browser doesn't support voice. Type instead.");
      return;
    }
    const rec = new SRClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalText = "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (
          (e.results[i] as unknown as { isFinal?: boolean }).isFinal
        ) {
          finalText += chunk;
        } else {
          interim += chunk;
        }
      }
      setTranscript(finalText + interim);
    };
    rec.onerror = (e) => {
      setError(e.error ?? "Mic error");
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  };

  const stop = () => {
    recRef.current?.stop?.();
    setListening(false);
  };

  const parseAndGo = async () => {
    // Make sure the mic is released before we fire off the parse —
    // otherwise the in-flight recognizer keeps appending and the UI
    // glitches while the request is pending.
    if (listening) stop();
    const text = transcript.trim();
    if (!text) return;
    setParsing(true);
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
    } finally {
      setParsing(false);
    }
  };

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
          onClick={listening ? stop : start}
          disabled={!supported && !listening}
          className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-3 transition-transform active:scale-95"
          style={{
            background: listening ? "#ef4444" : "var(--accent)",
            color: "#0a0a0a",
            boxShadow: listening
              ? "0 0 0 10px rgba(239,68,68,0.15)"
              : "0 12px 32px -8px rgba(34,197,94,0.6)",
          }}
          aria-label={listening ? "Stop listening" : "Start listening"}
        >
          {listening ? (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
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
          style={{ color: listening ? "#f87171" : "var(--fg-dim)" }}
        >
          {listening ? "Listening — tap to stop" : supported ? "Tap to start" : "Voice not supported — type below"}
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
        disabled={!transcript.trim() || parsing}
        className="btn-accent w-full py-3.5 rounded-xl text-[14px] font-semibold mb-5"
      >
        {parsing ? "Parsing your workout…" : "Parse & review"}
      </button>

      <div
        className="card p-4"
        style={{ background: "var(--bg-elevated)" }}
      >
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
