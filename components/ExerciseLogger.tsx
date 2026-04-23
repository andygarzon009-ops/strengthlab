"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usesPlates, PLATE_WEIGHT_LB } from "@/lib/exercises";

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
  currentSplit?: string;
};

export default function ExerciseLogger({
  exercises,
  setExercises,
  currentSplit,
}: Props) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [previousData, setPreviousData] = useState<
    Record<string, PreviousData>
  >({});

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then(setAllExercises);
  }, []);

  const matchesSplit = (ex: Exercise) => {
    if (!currentSplit) return true;
    if (showAll) return true;
    const splits = (ex.splits ?? "").split(",").map((s) => s.trim());
    return splits.includes(currentSplit);
  };

  const filtered = allExercises.filter(
    (e) =>
      matchesSplit(e) &&
      e.name.toLowerCase().includes(search.toLowerCase())
  );

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
        <div className="card overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                autoFocus
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
              <button
                onClick={() => {
                  setShowSearch(false);
                  setShowAll(false);
                }}
                className="w-8 h-8 flex items-center justify-center rounded-full"
                style={{ color: "var(--fg-muted)" }}
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
            </div>
            {currentSplit && (
              <div className="flex items-center justify-between mb-3 px-1">
                <p
                  className="label text-[10px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {showAll
                    ? "Showing all exercises"
                    : `Filtered to ${currentSplit.toLowerCase()} · ${filtered.length}`}
                </p>
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="label text-[10px]"
                  style={{ color: "var(--accent)" }}
                >
                  {showAll ? "Filter by split" : "Show all"}
                </button>
              </div>
            )}
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {filtered.slice(0, 30).map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex)}
                  className="w-full text-left px-3 py-2.5 rounded-lg transition-colors flex items-center justify-between"
                  style={{ color: "var(--fg)" }}
                >
                  <span className="text-[14px] font-medium">{ex.name}</span>
                  {ex.muscleGroup && (
                    <span
                      className="label text-[9px]"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {ex.muscleGroup}
                    </span>
                  )}
                </button>
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

            <div
              className="mt-3 pt-3 flex items-center justify-between"
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
        </div>
      ) : (
        <div className="space-y-2">
          <button
            onClick={() => setShowSearch(true)}
            className="w-full py-4 rounded-2xl text-[13px] font-medium transition-all"
            style={{
              border: "1px dashed var(--border-strong)",
              color: "var(--fg-muted)",
              background: "transparent",
            }}
          >
            + Add Exercise
          </button>
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
    </div>
  );
}

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

  // A working set with a weight but no reps is invalid — highlight it.
  const repsMissing =
    !isWarmup &&
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
          placeholder="lb"
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
        {plateMode ? "plates ×" : "×"}
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
