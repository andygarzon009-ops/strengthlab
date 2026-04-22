"use client";

import { useEffect, useState } from "react";

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

type Exercise = { id: string; name: string; muscleGroup: string | null };

type Props = {
  exercises: ExerciseData[];
  setExercises: (exercises: ExerciseData[]) => void;
};

export default function ExerciseLogger({ exercises, setExercises }: Props) {
  const [allExercises, setAllExercises] = useState<Exercise[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [previousData, setPreviousData] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch("/api/exercises")
      .then((r) => r.json())
      .then(setAllExercises);
  }, []);

  const filtered = allExercises.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase())
  );

  const addExercise = async (ex: Exercise) => {
    // Fetch previous workout data for this exercise
    const res = await fetch(`/api/exercises/${ex.id}/previous`);
    const prev = await res.json();

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
    // Renumber
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
    (updated[exIdx].sets[setIdx] as any)[field] = value;
    setExercises(updated);
  };

  const updateExerciseNotes = (exIdx: number, notes: string) => {
    const updated = [...exercises];
    updated[exIdx].notes = notes;
    setExercises(updated);
  };

  return (
    <div className="space-y-4">
      {exercises.map((ex, exIdx) => {
        const prev = previousData[ex.exerciseId];
        const warmupSets = ex.sets.filter((s) => s.type === "WARMUP");
        const workingSets = ex.sets.filter((s) => s.type === "WORKING");

        return (
          <div
            key={exIdx}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
          >
            <div className="p-4 pb-2">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-white text-base flex-1">
                  {ex.exerciseName}
                </h3>
                <button
                  onClick={() => removeExercise(exIdx)}
                  className="text-zinc-600 hover:text-red-400 text-xl leading-none ml-2 transition-colors"
                >
                  ×
                </button>
              </div>

              {prev && (
                <p className="text-zinc-500 text-xs mt-1">
                  Last: {prev.lastWeight}lbs × {prev.lastReps} ({prev.daysAgo}d ago)
                </p>
              )}

              <input
                value={ex.notes}
                onChange={(e) => updateExerciseNotes(exIdx, e.target.value)}
                placeholder="Cues / notes (e.g. neutral neck)"
                className="mt-2 w-full bg-zinc-800 text-zinc-300 placeholder-zinc-600 text-xs rounded-lg px-3 py-2 focus:outline-none"
              />
            </div>

            {/* Warm-up sets */}
            {warmupSets.length > 0 && (
              <div className="px-4 pb-2">
                <p className="text-zinc-500 text-xs font-medium mb-2">WARM-UP</p>
                {warmupSets.map((set, setIdx) => {
                  const actualIdx = ex.sets.indexOf(set);
                  return (
                    <SetRow
                      key={setIdx}
                      set={set}
                      setIdx={setIdx}
                      onUpdate={(field, val) => updateSet(exIdx, actualIdx, field, val)}
                      onRemove={() => removeSet(exIdx, actualIdx)}
                      isWarmup
                    />
                  );
                })}
              </div>
            )}

            {/* Working sets */}
            <div className="px-4 pb-2">
              <p className="text-zinc-500 text-xs font-medium mb-2">WORKING SETS</p>
              {workingSets.map((set, setIdx) => {
                const actualIdx = ex.sets.indexOf(set);
                return (
                  <SetRow
                    key={setIdx}
                    set={set}
                    setIdx={setIdx}
                    onUpdate={(field, val) => updateSet(exIdx, actualIdx, field, val)}
                    onRemove={() => removeSet(exIdx, actualIdx)}
                    isWarmup={false}
                  />
                );
              })}
            </div>

            {/* Add set buttons */}
            <div className="px-4 pb-4 flex gap-2">
              <button
                onClick={() => addSet(exIdx, "WARMUP")}
                className="flex-1 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-400 text-xs font-medium transition-colors"
              >
                + Warm-up
              </button>
              <button
                onClick={() => addSet(exIdx, "WORKING")}
                className="flex-1 py-2 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 text-xs font-medium transition-colors"
              >
                + Working Set
              </button>
            </div>
          </div>
        );
      })}

      {/* Add exercise */}
      {showSearch ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search exercises..."
                className="flex-1 bg-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-2.5 text-sm focus:outline-none"
              />
              <button
                onClick={() => setShowSearch(false)}
                className="text-zinc-500 hover:text-white px-2 py-2"
              >
                ✕
              </button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {filtered.slice(0, 15).map((ex) => (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex)}
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-800 transition-colors"
                >
                  <span className="text-white text-sm font-medium">{ex.name}</span>
                  {ex.muscleGroup && (
                    <span className="text-zinc-500 text-xs ml-2">
                      {ex.muscleGroup}
                    </span>
                  )}
                </button>
              ))}
              {search && filtered.length === 0 && (
                <button
                  onClick={() => {
                    // Create custom exercise
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
                  className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-zinc-800 text-orange-400 text-sm transition-colors"
                >
                  + Create &quot;{search}&quot;
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowSearch(true)}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-zinc-700 hover:border-orange-500/50 text-zinc-500 hover:text-orange-400 font-medium transition-all"
        >
          + Add Exercise
        </button>
      )}
    </div>
  );
}

function SetRow({
  set,
  setIdx,
  onUpdate,
  onRemove,
  isWarmup,
}: {
  set: SetData;
  setIdx: number;
  onUpdate: (field: keyof SetData, val: string) => void;
  onRemove: () => void;
  isWarmup: boolean;
}) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span
        className={`text-xs font-mono w-5 text-center flex-shrink-0 ${
          isWarmup ? "text-zinc-600" : "text-orange-400"
        }`}
      >
        {setIdx + 1}
      </span>
      <input
        type="number"
        value={set.weight}
        onChange={(e) => onUpdate("weight", e.target.value)}
        placeholder="lbs"
        className="w-16 bg-zinc-800 text-white text-center text-sm rounded-lg py-2 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      <span className="text-zinc-600 text-xs">×</span>
      <input
        type="number"
        value={set.reps}
        onChange={(e) => onUpdate("reps", e.target.value)}
        placeholder="reps"
        className="w-14 bg-zinc-800 text-white text-center text-sm rounded-lg py-2 focus:outline-none focus:ring-1 focus:ring-orange-500"
      />
      <input
        type="number"
        value={set.rir}
        onChange={(e) => onUpdate("rir", e.target.value)}
        placeholder="RIR"
        className="w-12 bg-zinc-800 text-zinc-400 text-center text-xs rounded-lg py-2 focus:outline-none"
      />
      <button
        onClick={onRemove}
        className="text-zinc-700 hover:text-red-400 text-lg leading-none transition-colors ml-auto"
      >
        ×
      </button>
    </div>
  );
}
