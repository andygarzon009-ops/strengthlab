"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  usesPlates,
  PLATE_WEIGHT_LB,
  platesPerSideBreakdown,
  isBodyweightCapable,
  isTimedExercise,
  specificMuscleFor,
} from "@/lib/exercises";

// Common gym shorthand → canonical phrases that appear in the exercise
// names. Lets a user type "db bench" and find "Flat Dumbbell Bench
// Press", or "ohp" for "Overhead Press". Each token can match either
// itself or any of its expansions.
const SEARCH_ALIASES: Record<string, string[]> = {
  db: ["dumbbell"],
  dbs: ["dumbbell"],
  bb: ["barbell"],
  bbs: ["barbell"],
  kb: ["kettlebell"],
  ohp: ["overhead press"],
  rdl: ["romanian deadlift"],
  sldl: ["stiff-leg deadlift"],
  bss: ["bulgarian split squat"],
  ssb: ["safety squat bar"],
  ghr: ["glute-ham raise", "glute ham raise"],
  bw: ["bodyweight"],
  ez: ["ez-bar"],
  hs: ["hammer strength"],
  pl: ["plate-loaded"],
  hip: ["hip thrust"],
  pull: ["pull-up", "pulldown", "pull down"],
  chin: ["chin-up"],
  cgbp: ["close-grip bench press"],
  ig: ["incline"],
  dl: ["deadlift"],
  squats: ["squat"],
  rows: ["row"],
  curls: ["curl"],
  press: ["press"],
};

const tokenize = (q: string) =>
  q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

const matchesSearch = (name: string, query: string): boolean => {
  const lowerName = name.toLowerCase();
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  return tokens.every((token) => {
    const variants = [token, ...(SEARCH_ALIASES[token] ?? [])];
    return variants.some((v) => lowerName.includes(v));
  });
};

// Default rest between working sets, in seconds. The floating Timer FAB
// counts down and beeps/vibrates at zero. Each exercise can override
// this via the rest pill on its card; choices are stored in localStorage
// so they persist across sessions per-exercise.
const REST_SECONDS_DEFAULT = 90;
const REST_OPTIONS = [60, 90, 120, 180, 240];

// Format rest seconds as a short pill label — under-2-minutes shows
// seconds, longer shows whole minutes so "4m" reads instantly without
// a second glance.
const formatRestLabel = (seconds: number): string => {
  if (seconds < 120) return `${seconds}s`;
  const m = seconds / 60;
  return Number.isInteger(m) ? `${m}m` : `${m.toFixed(1)}m`;
};
const REST_PREF_KEY = "strengthlab.rest.byExercise.v1";

const fireRestTimer = (seconds: number) => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("strengthlab:rest-start", { detail: { seconds } })
  );
};

const loadRestPrefs = (): Record<string, number> => {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(REST_PREF_KEY);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
};

const saveRestPrefs = (prefs: Record<string, number>) => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(REST_PREF_KEY, JSON.stringify(prefs));
  } catch {
    // ignore quota errors — pref is non-critical
  }
};

type SetData = {
  type: "WARMUP" | "WORKING";
  setNumber: number;
  weight: string;
  reps: string;
  rir: string;
  notes: string;
};

type ExerciseData = {
  exerciseId: string;
  exerciseName: string;
  notes: string;
  sets: SetData[];
};

type Exercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  splits: string | null;
};

type PreviousData = {
  lastWeight?: number;
  lastReps?: number;
  daysAgo?: number;
};

type Props = {
  exercises: ExerciseData[];
  setExercises: (exercises: ExerciseData[]) => void;
};

export default function ExerciseLogger({
  exercises,
  setExercises,
}: Props) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showVoice, setShowVoice] = useState(false);
  const [previousData, setPreviousData] = useState<
    Record<string, PreviousData>
  >({});
  // When set, the next exercise picked from the search modal replaces the
  // exercise at this index instead of appending — preserves sets/notes so
  // users can correct an exercise mid-log without re-entering everything.
  const [swapTargetIdx, setSwapTargetIdx] = useState<number | null>(null);
  // Per-exercise rest duration override, keyed by exerciseId. Falls back
  // to REST_SECONDS_DEFAULT when an exercise has no saved preference.
  const [restPrefs, setRestPrefs] = useState<Record<string, number>>({});

  useEffect(() => {
    setRestPrefs(loadRestPrefs());
  }, []);

  const restFor = (exerciseId: string): number =>
    restPrefs[exerciseId] ?? REST_SECONDS_DEFAULT;

  const cycleRest = (exerciseId: string) => {
    setRestPrefs((prev) => {
      const cur = prev[exerciseId] ?? REST_SECONDS_DEFAULT;
      const idx = REST_OPTIONS.indexOf(cur);
      const next = REST_OPTIONS[(idx + 1) % REST_OPTIONS.length];
      const updated = { ...prev, [exerciseId]: next };
      saveRestPrefs(updated);
      return updated;
    });
  };

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then(setAllExercises);
  }, []);

  const filtered = allExercises
    .filter((e) => matchesSearch(e.name, search))
    .sort((a, b) => {
      const ag = a.muscleGroup ?? "Other";
      const bg = b.muscleGroup ?? "Other";
      if (ag !== bg) return ag.localeCompare(bg);
      return a.name.localeCompare(b.name);
    });

  // Group by muscle when not actively searching, so the dropdown is
  // scannable as "Back ▸ ...", "Biceps ▸ ...", etc.
  const grouped = search
    ? null
    : filtered.reduce<{ group: string; items: Exercise[] }[]>((acc, ex) => {
        const group = ex.muscleGroup ?? "Other";
        const last = acc[acc.length - 1];
        if (last && last.group === group) last.items.push(ex);
        else acc.push({ group, items: [ex] });
        return acc;
      }, []);

  const addExercise = async (ex: Exercise) => {
    const res = await fetch(`/api/exercises/${ex.id}/previous`);
    const prev: PreviousData = await res.json();

    if (prev?.lastWeight) {
      setPreviousData((p) => ({ ...p, [ex.id]: prev }));
    }

    // Swap mode: replace the targeted exercise's id/name and keep its
    // existing sets + notes. Users picked the wrong exercise originally
    // and just want to fix the label without re-logging the work.
    if (swapTargetIdx !== null) {
      const updated = exercises.map((e, i) =>
        i === swapTargetIdx
          ? { ...e, exerciseId: ex.id, exerciseName: ex.name }
          : e
      );
      setExercises(updated);
      setSwapTargetIdx(null);
      setSearch("");
      setShowSearch(false);
      return;
    }

    const newEx: ExerciseData = {
      exerciseId: ex.id,
      exerciseName: ex.name,
      notes: "",
      sets: [
        {
          type: "WORKING",
          setNumber: 1,
          weight: prev?.lastWeight?.toString() ?? "",
          reps: prev?.lastReps?.toString() ?? "",
          rir: "",
          notes: "",
        },
      ],
    };

    setExercises([...exercises, newEx]);
    setSearch("");
    setShowSearch(false);
  };

  const startSwap = (idx: number) => {
    setSwapTargetIdx(idx);
    setShowSearch(true);
  };

  const removeExercise = (idx: number) => {
    setExercises(exercises.filter((_, i) => i !== idx));
  };

  const addSet = (exIdx: number, type: "WARMUP" | "WORKING") => {
    const updated = [...exercises];
    const ex = updated[exIdx];
    const sameType = ex.sets.filter((s) => s.type === type);
    const last = sameType[sameType.length - 1];
    ex.sets.push({
      type,
      setNumber: sameType.length + 1,
      weight: last?.weight ?? "",
      reps: last?.reps ?? "",
      rir: "",
      notes: "",
    });
    setExercises(updated);
  };

  const removeSet = (exIdx: number, setIdx: number) => {
    const updated = [...exercises];
    updated[exIdx].sets.splice(setIdx, 1);
    updated[exIdx].sets
      .filter((s) => s.type === updated[exIdx].sets[setIdx]?.type)
      .forEach((s, i) => (s.setNumber = i + 1));
    setExercises(updated);
  };

  const updateSet = (
    exIdx: number,
    setIdx: number,
    field: keyof SetData,
    value: string
  ) => {
    const updated = [...exercises];
    (updated[exIdx].sets[setIdx] as unknown as Record<string, string>)[field] = value;
    setExercises(updated);
  };

  const updateExerciseNotes = (exIdx: number, notes: string) => {
    const updated = [...exercises];
    updated[exIdx].notes = notes;
    setExercises(updated);
  };

  const appendVoiceExercises = (parsed: ExerciseData[]) => {
    if (parsed.length === 0) return;
    setExercises([...exercises, ...parsed]);
  };

  return (
    <div className="space-y-3">
      {exercises.map((ex, exIdx) => {
        const prev = previousData[ex.exerciseId];
        const warmupSets = ex.sets.filter((s) => s.type === "WARMUP");
        const workingSets = ex.sets.filter((s) => s.type === "WORKING");

        return (
          <div key={exIdx} className="card overflow-hidden">
            <div className="p-4 pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-[15px] tracking-tight truncate">
                    {ex.exerciseName}
                  </h3>
                  {prev && (
                    <p
                      className="text-[11px] mt-1 nums"
                      style={{
                        color: "var(--fg-dim)",
                        fontFamily: "var(--font-geist-mono)",
                      }}
                    >
                      Last:{" "}
                      {usesPlates(ex.exerciseName)
                        ? `${(prev.lastWeight ?? 0) / (PLATE_WEIGHT_LB * 2)} plates`
                        : isBodyweightCapable(ex.exerciseName)
                          ? (prev.lastWeight ?? 0) > 0
                            ? `+${prev.lastWeight}lb`
                            : "BW"
                          : `${prev.lastWeight}lb`}{" "}
                      × {prev.lastReps} · {prev.daysAgo}d ago
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => cycleRest(ex.exerciseId)}
                    className="px-2 h-7 rounded-full text-[11px] font-semibold tracking-tight nums transition-colors active:scale-95"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                      color: "var(--fg-muted)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                    aria-label="Cycle rest duration"
                    title="Tap to change rest duration"
                  >
                    {formatRestLabel(restFor(ex.exerciseId))}
                  </button>
                  <button
                    onClick={() => startSwap(exIdx)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ color: "var(--fg-dim)" }}
                    aria-label="Change exercise"
                    title="Change exercise (keep sets)"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 4 3 8l4 4" />
                      <path d="M3 8h13a4 4 0 0 1 4 4" />
                      <path d="m17 20 4-4-4-4" />
                      <path d="M21 16H8a4 4 0 0 1-4-4" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeExercise(exIdx)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                    style={{ color: "var(--fg-dim)" }}
                    aria-label="Remove exercise"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

            </div>

            {warmupSets.length > 0 && (
              <div className="px-4 pb-1">
                <p className="label mb-2">Warm-up</p>
                {warmupSets.map((set, setIdx) => {
                  const actualIdx = ex.sets.indexOf(set);
                  return (
                    <SetRow
                      key={setIdx}
                      set={set}
                      setIdx={setIdx}
                      exerciseName={ex.exerciseName}
                      restSeconds={restFor(ex.exerciseId)}
                      onUpdate={(field, val) =>
                        updateSet(exIdx, actualIdx, field, val)
                      }
                      onRemove={() => removeSet(exIdx, actualIdx)}
                      isWarmup
                    />
                  );
                })}
              </div>
            )}

            <div className="px-4 pb-3">
              <p className="label mb-2">Working sets</p>
              {workingSets.map((set, setIdx) => {
                const actualIdx = ex.sets.indexOf(set);
                return (
                  <SetRow
                    key={setIdx}
                    set={set}
                    setIdx={setIdx}
                    exerciseName={ex.exerciseName}
                    restSeconds={restFor(ex.exerciseId)}
                    onUpdate={(field, val) =>
                      updateSet(exIdx, actualIdx, field, val)
                    }
                    onRemove={() => removeSet(exIdx, actualIdx)}
                    isWarmup={false}
                  />
                );
              })}
            </div>

            <div className="px-4 pb-3">
              <input
                value={ex.notes}
                onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                placeholder="Cues (optional)"
                className="w-full text-[12px] rounded-lg px-3 py-2 focus:outline-none"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              />
            </div>

            <div
              className="px-4 py-3 flex gap-2"
              style={{ borderTop: "1px solid var(--border)" }}
            >
              <button
                onClick={() => addSet(exIdx, "WARMUP")}
                className="flex-1 py-2 rounded-lg text-[11px] font-semibold transition-colors label"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--fg-muted)",
                  letterSpacing: "0.1em",
                }}
              >
                + Warm-up
              </button>
              <button
                onClick={() => addSet(exIdx, "WORKING")}
                className="flex-1 py-2 rounded-lg text-[11px] font-semibold transition-colors label"
                style={{
                  background: "var(--accent-dim)",
                  color: "var(--accent)",
                  letterSpacing: "0.1em",
                }}
              >
                + Working
              </button>
            </div>
          </div>
        );
      })}

      {showSearch ? (
        <>
          <div
            className="fixed inset-0 z-[59]"
            style={{ background: "rgba(0,0,0,0.6)" }}
            onClick={() => {
              setShowSearch(false);
              setSearch("");
              setSwapTargetIdx(null);
            }}
          />
          <div
            className="fixed z-[60] flex flex-col rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              top: "calc(env(safe-area-inset-top) + 16px)",
              bottom: "calc(env(safe-area-inset-bottom) + 16px)",
              left: 12,
              right: 12,
            }}
          >
          <div
            className="px-4 py-3 flex items-center gap-2"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <button
              onClick={() => {
                setShowSearch(false);
                setSearch("");
                setSwapTargetIdx(null);
              }}
              className="w-9 h-9 flex items-center justify-center rounded-full shrink-0"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
              }}
              aria-label="Close exercise picker"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                swapTargetIdx !== null
                  ? `Replace "${exercises[swapTargetIdx]?.exerciseName ?? ""}"…`
                  : "Search exercises…"
              }
              className="flex-1 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none"
              style={{
                background: "var(--bg-elevated)",
                border:
                  swapTargetIdx !== null
                    ? "1px solid rgba(34,197,94,0.45)"
                    : "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-3 pb-6">
            {grouped ? (
              <div className="space-y-3">
                {grouped.map(({ group, items }) => (
                  <div key={group}>
                    <p
                      className="label text-[10px] mb-1 px-1 sticky top-0 py-1"
                      style={{
                        color: "var(--fg-dim)",
                        background: "var(--bg)",
                      }}
                    >
                      {group}
                    </p>
                    <div className="space-y-0.5">
                      {items.map((ex) => (
                        <ExerciseRow
                          key={ex.id}
                          ex={ex}
                          onClick={() => addExercise(ex)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-0.5">
                {filtered.map((ex) => (
                  <ExerciseRow
                    key={ex.id}
                    ex={ex}
                    onClick={() => addExercise(ex)}
                  />
                ))}
                {search && filtered.length === 0 && (
                  <button
                    onClick={() => {
                      fetch("/api/exercises", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: search }),
                      })
                        .then((r) => r.json())
                        .then((ex) => {
                          setAllExercises((prev) => [...prev, ex]);
                          addExercise(ex);
                        });
                    }}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-[14px] transition-colors"
                    style={{ color: "var(--accent)" }}
                  >
                    + Create &quot;{search}&quot;
                  </button>
                )}
              </div>
            )}
          </div>
          <div
            className="px-4 py-3 flex items-center justify-between shrink-0"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            <p
              className="label text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Missing something?
            </p>
            <Link
              href="/exercises"
              className="label text-[10px]"
              style={{ color: "var(--accent)" }}
            >
              Manage library →
            </Link>
          </div>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              onClick={() => setShowSearch(true)}
              className="flex-1 py-4 rounded-2xl text-[13px] font-medium transition-all"
              style={{
                border: "1px dashed var(--border-strong)",
                color: "var(--fg-muted)",
                background: "transparent",
              }}
            >
              + Add Exercise
            </button>
            <button
              onClick={() => setShowVoice(true)}
              aria-label="Voice add exercises"
              className="w-14 rounded-2xl flex items-center justify-center transition-all active:scale-95"
              style={{
                background: "var(--accent-dim)",
                color: "var(--accent)",
                border: "1px solid rgba(34,197,94,0.35)",
              }}
            >
              <svg
                width="18"
                height="18"
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
            </button>
          </div>
          <Link
            href="/exercises"
            className="card px-4 py-3 flex items-center justify-between transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "var(--bg-elevated)" }}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M6 4h2v16H6zM16 4h2v16h-2zM3 8h3v8H3zM18 8h3v8h-3zM8 11h8v2H8z" />
                </svg>
              </div>
              <div>
                <p className="text-[13px] font-semibold">
                  Manage exercise library
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--fg-dim)" }}
                >
                  Add or edit custom exercises and split tags
                </p>
              </div>
            </div>
            <span
              className="text-[16px]"
              style={{ color: "var(--fg-dim)" }}
            >
              →
            </span>
          </Link>
        </div>
      )}

      {showVoice && (
        <VoiceAddModal
          onClose={() => setShowVoice(false)}
          onParsed={(exs) => {
            appendVoiceExercises(exs);
            setShowVoice(false);
          }}
        />
      )}
    </div>
  );
}

function VoiceAddModal({
  onClose,
  onParsed,
}: {
  onClose: () => void;
  onParsed: (exercises: ExerciseData[]) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [stage, setStage] = useState<
    "idle" | "recording" | "transcribing" | "parsing"
  >("idle");
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
      // Append to whatever the user already had — supports multiple
      // recordings stacked together before parsing.
      const next = (body.transcript ?? "").trim();
      setTranscript((t) => (t ? `${t} ${next}` : next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setStage("idle");
    }
  };

  const start = async () => {
    setError("");
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

  const parse = async () => {
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
      const exs: ExerciseData[] = body.draft?.exercises ?? [];
      if (exs.length === 0) {
        setError("Couldn't pick out any exercises. Try again.");
        setStage("idle");
        return;
      }
      onParsed(exs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
      setStage("idle");
    }
  };

  const recording = stage === "recording";
  const transcribing = stage === "transcribing";
  const parsing = stage === "parsing";
  const busy = transcribing || parsing;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card w-full max-w-lg p-5 overflow-y-auto"
        style={{
          background: "var(--bg-card)",
          maxHeight: "calc(100dvh - 2rem)",
        }}
      >
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <p className="label">Voice add</p>
            <h3 className="text-[17px] font-bold tracking-tight mt-0.5">
              Dictate exercises
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[20px]"
            style={{ color: "var(--fg-dim)" }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex justify-center mb-3">
          <button
            onClick={recording ? stop : start}
            disabled={(!supported && !recording) || busy}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{
              background: recording ? "#ef4444" : "var(--accent)",
              color: "#0a0a0a",
              boxShadow: recording
                ? "0 0 0 8px rgba(239,68,68,0.15)"
                : "0 10px 24px -8px rgba(34,197,94,0.5)",
              opacity: busy ? 0.5 : 1,
            }}
            aria-label={recording ? "Stop" : "Start"}
          >
            {recording ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            ) : (
              <svg
                width="22"
                height="22"
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
        </div>

        <p
          className="label text-[10px] text-center mb-3"
          style={{
            color: recording
              ? "#f87171"
              : transcribing
              ? "var(--accent)"
              : "var(--fg-dim)",
          }}
        >
          {recording
            ? "Listening — tap to stop"
            : transcribing
            ? "Transcribing…"
            : supported
            ? "Tap mic or type below"
            : "Type your exercises below"}
        </p>

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder='e.g. "Incline DB press 4 sets of 65 for 10, then lateral raises 3 of 25 for 15"'
          rows={4}
          className="w-full rounded-xl px-3 py-2.5 text-[13px] focus:outline-none resize-none mb-3"
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

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="btn-ghost px-4 py-2.5 rounded-xl text-[13px]"
          >
            Cancel
          </button>
          <button
            onClick={parse}
            disabled={!transcript.trim() || busy}
            className="btn-accent flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
          >
            {parsing ? "Parsing…" : "Add to log"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SetRow({
  set,
  setIdx,
  exerciseName,
  restSeconds,
  onUpdate,
  onRemove,
  isWarmup,
}: {
  set: SetData;
  setIdx: number;
  exerciseName: string;
  restSeconds: number;
  onUpdate: (field: keyof SetData, val: string) => void;
  onRemove: () => void;
  isWarmup: boolean;
}) {
  // Local "completed" state for working sets — ephemeral UI flag that
  // also gates the auto rest timer. Toggling on fires the timer once.
  // Editing a previously-saved log won't show set rows in done state
  // because state is per-mount.
  const [done, setDone] = useState(false);
  const toggleDone = () => {
    if (isWarmup) return;
    const next = !done;
    setDone(next);
    if (next) {
      const n = parseInt(set.reps.trim(), 10);
      if (Number.isFinite(n) && n > 0) {
        fireRestTimer(restSeconds);
      }
    }
  };
  const repsRef = useRef<HTMLInputElement>(null);
  const plateMode = usesPlates(exerciseName);
  const timedMode = isTimedExercise(exerciseName);
  const bodyweightMode =
    !plateMode && !timedMode && isBodyweightCapable(exerciseName);

  // A working set with a weight but no reps is invalid — highlight it.
  // Timed holds are valid with just seconds (bodyweight is the default).
  const repsMissing =
    !isWarmup &&
    !timedMode &&
    set.weight.trim() !== "" &&
    parseFloat(set.weight) > 0 &&
    set.reps.trim() === "";

  const handleWeightBlur = () => {
    // If user entered a weight and reps is empty, nudge focus to reps
    if (
      set.weight.trim() !== "" &&
      parseFloat(set.weight) > 0 &&
      set.reps.trim() === ""
    ) {
      setTimeout(() => repsRef.current?.focus(), 0);
    }
  };

  // ± stepper for the weight input — always 5 lb total, plate mode or
  // not. Lifters micro-load with 2.5 lb plates per side (= 5 lb total)
  // and call jumps in 5 lb increments at the rack; bumping a full
  // 45 lb plate per tap was way too coarse.
  const stepWeight = (direction: 1 | -1) => {
    if (timedMode) return;
    const cur = parseFloat(set.weight);
    const base = Number.isFinite(cur) ? cur : 0;
    const next = Math.max(0, Math.round((base + 5 * direction) * 100) / 100);
    onUpdate("weight", next === 0 ? "" : String(next));
  };

  const plateLb = parseFloat(set.weight);
  const plateBreakdown = plateMode && Number.isFinite(plateLb) && plateLb > 0
    ? platesPerSideBreakdown(plateLb / 2)
    : "";

  // Plate-loaded mode: gym-culture splits load into "plates per side"
  // (whole 45-lb plates) and "extras per side" (the small plates a
  // lifter calls out separately — "2 plates and a 25"). The text input
  // edits the plate count; the ± stepper walks extras in 5 lb-per-side
  // increments and rolls into another full plate at +45.
  const totalLb = Number.isFinite(plateLb) && plateLb > 0 ? plateLb : 0;
  const totalPerSide = totalLb / 2;
  const fullPlatesPerSide = Math.floor(totalPerSide / PLATE_WEIGHT_LB);
  const extrasPerSide = +(totalPerSide - fullPlatesPerSide * PLATE_WEIGHT_LB).toFixed(2);

  const platesValue = fullPlatesPerSide > 0 ? String(fullPlatesPerSide) : "";
  const handlePlatesChange = (val: string) => {
    if (val.trim() === "") {
      onUpdate("weight", "");
      return;
    }
    const plates = parseInt(val, 10);
    if (!Number.isFinite(plates) || plates < 0) return;
    // Preserve the existing per-side extras when the lifter retypes
    // the plate count — e.g. "2 plates and a 25" → 3 plates and a 25
    // instead of resetting to a clean 3 plates.
    const newPerSide = plates * PLATE_WEIGHT_LB + extrasPerSide;
    onUpdate("weight", newPerSide > 0 ? String(newPerSide * 2) : "");
  };

  const stepExtras = (direction: 1 | -1) => {
    const stepLb = 5; // per-side
    const nextPerSide = totalPerSide + stepLb * direction;
    if (nextPerSide <= 0) {
      onUpdate("weight", "");
      return;
    }
    onUpdate("weight", String(+(nextPerSide * 2).toFixed(2)));
  };

  // Common visual treatment when a working set has been ticked done.
  const doneRowStyle = done
    ? {
        background: "rgba(34,197,94,0.07)",
        borderRadius: 12,
        padding: "4px 6px",
        margin: "-4px -6px 6px -6px",
      }
    : {};

  if (timedMode) {
    return (
      <div className="flex items-center gap-2 mb-1.5" style={doneRowStyle}>
        <span
          className="nums text-[11px] w-5 text-center shrink-0 font-semibold"
          style={{
            color: isWarmup ? "var(--fg-dim)" : "var(--accent)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {setIdx + 1}
        </span>
        <input
          type="number"
          inputMode="numeric"
          value={set.reps}
          onChange={(e) => onUpdate("reps", e.target.value)}
          placeholder="sec"
          className="w-20 text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
        <span style={{ color: "var(--fg-dim)", fontSize: "11px" }}>sec</span>
        <input
          type="number"
          inputMode="decimal"
          value={set.weight}
          onChange={(e) => onUpdate("weight", e.target.value)}
          placeholder="+lb"
          className="w-14 text-center text-[12px] rounded-lg py-2 focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
        <span style={{ color: "var(--fg-dim)", fontSize: "11px" }}>
          {!set.weight || parseFloat(set.weight) === 0 ? "BW" : "load"}
        </span>
        {!isWarmup && (
          <button
            type="button"
            onClick={toggleDone}
            className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center transition-transform active:scale-90"
            style={{
              background: done ? "var(--accent)" : "var(--bg-elevated)",
              border: `1px solid ${done ? "var(--accent)" : "var(--border)"}`,
              color: done ? "#0a0a0a" : "var(--fg-muted)",
            }}
            aria-label={done ? "Mark set incomplete" : "Mark set complete"}
            title={
              done
                ? "Tap to undo"
                : `Mark set done — starts ${restSeconds}s rest`
            }
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12l5 5 9-11" />
            </svg>
          </button>
        )}
        <button
          onClick={onRemove}
          className={`${isWarmup ? "ml-auto" : ""} w-7 h-7 flex items-center justify-center`}
          style={{ color: "var(--fg-dim)" }}
          aria-label="Remove set"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  const stepperBtnStyle = {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    color: "var(--fg-muted)",
  } as const;

  return (
    <div className="flex flex-col mb-1.5" style={doneRowStyle}>
    <div className="flex items-center gap-1.5">
      <span
        className="nums text-[11px] w-5 text-center shrink-0 font-semibold"
        style={{
          color: isWarmup ? "var(--fg-dim)" : "var(--accent)",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {setIdx + 1}
      </span>
      <button
        type="button"
        onClick={() => (plateMode ? stepExtras(-1) : stepWeight(-1))}
        aria-label={plateMode ? "Decrease extras" : "Decrease weight"}
        className="w-7 h-9 rounded-lg shrink-0 text-[14px] font-semibold leading-none active:scale-95 transition-transform"
        style={stepperBtnStyle}
      >
        −
      </button>
      {plateMode ? (
        <input
          type="number"
          inputMode="numeric"
          step="1"
          value={platesValue}
          onChange={(e) => handlePlatesChange(e.target.value)}
          onBlur={handleWeightBlur}
          placeholder="plates"
          aria-label="Plates per side"
          className="w-14 text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
      ) : (
        <input
          type="number"
          inputMode="decimal"
          value={set.weight}
          onChange={(e) => onUpdate("weight", e.target.value)}
          onBlur={handleWeightBlur}
          placeholder={bodyweightMode ? "+lb" : "lb"}
          className="w-14 text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
      )}
      <button
        type="button"
        onClick={() => (plateMode ? stepExtras(1) : stepWeight(1))}
        aria-label={plateMode ? "Increase extras" : "Increase weight"}
        className="w-7 h-9 rounded-lg shrink-0 text-[14px] font-semibold leading-none active:scale-95 transition-transform"
        style={stepperBtnStyle}
      >
        +
      </button>
      {plateMode && extrasPerSide > 0 && (
        <span
          className="nums text-[11px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
            fontFamily: "var(--font-geist-mono)",
          }}
          title={`Extras: ${extrasPerSide} lb per side`}
        >
          +{Number.isInteger(extrasPerSide) ? extrasPerSide : extrasPerSide.toFixed(1)}
        </span>
      )}
      <span style={{ color: "var(--fg-dim)", fontSize: "11px" }}>
        {plateMode
          ? "× "
          : bodyweightMode && (!set.weight || parseFloat(set.weight) === 0)
            ? "BW ×"
            : "×"}
      </span>
      <input
        ref={repsRef}
        type="number"
        inputMode="numeric"
        value={set.reps}
        onChange={(e) => onUpdate("reps", e.target.value)}
        placeholder="reps"
        className="w-14 text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
        style={{
          background: repsMissing
            ? "rgba(239,68,68,0.08)"
            : "var(--bg-elevated)",
          border: `1px solid ${
            repsMissing ? "rgba(239,68,68,0.5)" : "var(--border)"
          }`,
          color: repsMissing ? "#fca5a5" : "var(--fg)",
          fontFamily: "var(--font-geist-mono)",
        }}
      />
      <input
        type="number"
        inputMode="numeric"
        value={set.rir}
        onChange={(e) => onUpdate("rir", e.target.value)}
        placeholder="RIR"
        className="w-12 text-center text-[11px] rounded-lg py-2 focus:outline-none"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg-muted)",
        }}
      />
      {!isWarmup && (
        <button
          type="button"
          onClick={toggleDone}
          className="ml-auto w-8 h-8 rounded-lg flex items-center justify-center transition-transform active:scale-90"
          style={{
            background: done ? "var(--accent)" : "var(--bg-elevated)",
            border: `1px solid ${done ? "var(--accent)" : "var(--border)"}`,
            color: done ? "#0a0a0a" : "var(--fg-muted)",
          }}
          aria-label={done ? "Mark set incomplete" : "Mark set complete"}
          title={
            done
              ? "Tap to undo"
              : `Mark set done — starts ${formatRestLabel(restSeconds)} rest`
          }
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12l5 5 9-11" />
          </svg>
        </button>
      )}
      <button
        onClick={onRemove}
        className={`${isWarmup ? "ml-auto" : ""} w-7 h-7 flex items-center justify-center`}
        style={{ color: "var(--fg-dim)" }}
        aria-label="Remove set"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
    {plateMode && plateBreakdown && (
      <p
        className="nums text-[10px] mt-1 ml-7"
        style={{
          color: "var(--fg-dim)",
          fontFamily: "var(--font-geist-mono)",
          letterSpacing: "0.04em",
        }}
      >
        per side: {plateBreakdown}
      </p>
    )}
    </div>
  );
}

function ExerciseRow({
  ex,
  onClick,
}: {
  ex: Exercise;
  onClick: () => void;
}) {
  const detail = (() => {
    const s = specificMuscleFor(ex.name);
    return s === "Other" && ex.muscleGroup ? ex.muscleGroup : s;
  })();
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between"
      style={{ color: "var(--fg)" }}
    >
      <span className="text-[14px] font-medium">{ex.name}</span>
      <span
        className="label text-[9px]"
        style={{ color: "var(--fg-dim)" }}
      >
        {detail}
      </span>
    </button>
  );
}
