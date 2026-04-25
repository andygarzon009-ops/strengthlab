"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  usesPlates,
  PLATE_WEIGHT_LB,
  isBodyweightCapable,
  isTimedExercise,
  specificMuscleFor,
} from "@/lib/exercises";

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

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then(setAllExercises);
  }, []);

  const filtered = allExercises
    .filter((e) => e.name.toLowerCase().includes(search.toLowerCase()))
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

    if (prev?.lastWeight) {
      setPreviousData((p) => ({ ...p, [ex.id]: prev }));
    }

    setExercises([...exercises, newEx]);
    setSearch("");
    setShowSearch(false);
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

              <input
                value={ex.notes}
                onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                placeholder="Cues…"
                className="mt-2.5 w-full text-[12px] rounded-lg px-3 py-2 focus:outline-none"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              />
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
                    onUpdate={(field, val) =>
                      updateSet(exIdx, actualIdx, field, val)
                    }
                    onRemove={() => removeSet(exIdx, actualIdx)}
                    isWarmup={false}
                  />
                );
              })}
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
              placeholder="Search exercises…"
              className="flex-1 rounded-xl px-4 py-2.5 text-[14px] focus:outline-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
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
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState("");
  const recRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SRClass = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (SRClass) setSupported(true);
  }, []);

  const start = () => {
    setError("");
    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRec;
      webkitSpeechRecognition?: new () => SpeechRec;
    };
    const SRClass = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!SRClass) {
      setError("Mic not supported here — type instead.");
      return;
    }
    const rec = new SRClass();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    let finalText = transcript ? transcript + " " : "";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if ((e.results[i] as { isFinal?: boolean }).isFinal) {
          finalText += chunk;
        } else {
          interim += chunk;
        }
      }
      setTranscript((finalText + interim).trim());
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

  const parse = async () => {
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
      const exs: ExerciseData[] = body.draft?.exercises ?? [];
      if (exs.length === 0) {
        setError("Couldn't pick out any exercises. Try again.");
        setParsing(false);
        return;
      }
      onParsed(exs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Parse failed");
      setParsing(false);
    }
  };

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
            onClick={listening ? stop : start}
            disabled={!supported && !listening}
            className="w-16 h-16 rounded-full flex items-center justify-center transition-transform active:scale-95"
            style={{
              background: listening ? "#ef4444" : "var(--accent)",
              color: "#0a0a0a",
              boxShadow: listening
                ? "0 0 0 8px rgba(239,68,68,0.15)"
                : "0 10px 24px -8px rgba(34,197,94,0.5)",
            }}
            aria-label={listening ? "Stop" : "Start"}
          >
            {listening ? (
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
          style={{ color: listening ? "#f87171" : "var(--fg-dim)" }}
        >
          {listening
            ? "Listening — tap to stop"
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
            disabled={!transcript.trim() || parsing}
            className="btn-accent flex-1 py-2.5 rounded-xl text-[13px] font-semibold"
          >
            {parsing ? "Parsing…" : "Add to log"}
          </button>
        </div>
      </div>
    </div>
  );
}

type SpeechRec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: (e: {
    results: { [i: number]: { [i: number]: { transcript: string } }; length: number };
  }) => void;
  onerror: (e: { error?: string }) => void;
  onend: () => void;
};

function SetRow({
  set,
  setIdx,
  exerciseName,
  onUpdate,
  onRemove,
  isWarmup,
}: {
  set: SetData;
  setIdx: number;
  exerciseName: string;
  onUpdate: (field: keyof SetData, val: string) => void;
  onRemove: () => void;
  isWarmup: boolean;
}) {
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

  // Plate-loaded mode: user enters plates per side, we store total weight.
  // Allow half-plate fractions (e.g. "2.5") since gyms have 25lb plates.
  const weightNum = parseFloat(set.weight);
  const platesValue = Number.isFinite(weightNum) && weightNum > 0
    ? String(weightNum / (PLATE_WEIGHT_LB * 2))
    : "";
  const handlePlatesChange = (val: string) => {
    if (val.trim() === "") {
      onUpdate("weight", "");
      return;
    }
    const plates = parseFloat(val);
    if (!Number.isFinite(plates) || plates < 0) return;
    onUpdate("weight", String(plates * PLATE_WEIGHT_LB * 2));
  };

  if (timedMode) {
    return (
      <div className="flex items-center gap-2 mb-1.5">
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
        <button
          onClick={onRemove}
          className="ml-auto w-7 h-7 flex items-center justify-center"
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

  return (
    <div className="flex items-center gap-2 mb-1.5">
      <span
        className="nums text-[11px] w-5 text-center shrink-0 font-semibold"
        style={{
          color: isWarmup ? "var(--fg-dim)" : "var(--accent)",
          fontFamily: "var(--font-geist-mono)",
        }}
      >
        {setIdx + 1}
      </span>
      {plateMode ? (
        <input
          type="number"
          inputMode="decimal"
          step="0.5"
          value={platesValue}
          onChange={(e) => handlePlatesChange(e.target.value)}
          onBlur={handleWeightBlur}
          placeholder="plates"
          aria-label="Plates per side"
          className="w-16 text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
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
          className="w-16 text-center text-[14px] rounded-lg py-2 focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
      )}
      <span style={{ color: "var(--fg-dim)", fontSize: "11px" }}>
        {plateMode
          ? "plates ×"
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
      <button
        onClick={onRemove}
        className="ml-auto w-7 h-7 flex items-center justify-center"
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
