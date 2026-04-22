"use client";

import { createWorkout } from "@/lib/actions/workouts";
import { WORKOUT_TYPES, FEELING_OPTIONS } from "@/lib/exercises";
import ExerciseLogger from "@/components/ExerciseLogger";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LogWorkoutPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [step, setStep] = useState<"type" | "log">("type");
  const [workoutType, setWorkoutType] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [feeling, setFeeling] = useState("");
  const [isDeload, setIsDeload] = useState(false);
  const [exercises, setExercises] = useState<ExerciseData[]>([]);

  type ExerciseData = {
    exerciseId: string;
    exerciseName: string;
    notes: string;
    sets: SetData[];
  };

  type SetData = {
    type: "WARMUP" | "WORKING";
    setNumber: number;
    weight: string;
    reps: string;
    rir: string;
    notes: string;
  };

  const handleTypeSelect = (type: string) => {
    setWorkoutType(type);
    const label = WORKOUT_TYPES.find((t) => t.value === type)?.label ?? type;
    setTitle(`${label} Day`);
    setStep("log");
  };

  const handleSave = () => {
    if (!title || exercises.length === 0) return;

    startTransition(async () => {
      await createWorkout({
        title,
        type: workoutType,
        date: new Date().toISOString(),
        notes: notes || undefined,
        feeling: feeling || undefined,
        isDeload,
        exercises: exercises.map((ex, i) => ({
          exerciseId: ex.exerciseId,
          order: i,
          notes: ex.notes || undefined,
          sets: ex.sets.map((s) => ({
            type: s.type,
            setNumber: s.setNumber,
            weight: s.weight ? parseFloat(s.weight) : undefined,
            reps: s.reps ? parseInt(s.reps) : undefined,
            rir: s.rir ? parseInt(s.rir) : undefined,
            notes: s.notes || undefined,
          })),
        })),
      });
    });
  };

  if (step === "type") {
    return (
      <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/" className="text-zinc-400 hover:text-white p-1">
            ←
          </Link>
          <h1 className="text-2xl font-bold text-white">Start Workout</h1>
        </div>

        <p className="text-zinc-400 text-sm mb-4">Choose workout type</p>

        <div className="grid grid-cols-2 gap-3">
          {WORKOUT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => handleTypeSelect(type.value)}
              className="bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 rounded-2xl p-5 text-left transition-all active:scale-95"
            >
              <span className="text-3xl block mb-2">{type.emoji}</span>
              <span className={`font-bold text-lg block ${type.color}`}>
                {type.label}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setStep("type")}
          className="text-zinc-400 hover:text-white p-1"
        >
          ←
        </button>
        <h1 className="text-xl font-bold text-white flex-1">Log Workout</h1>
        <button
          onClick={handleSave}
          disabled={!title || exercises.length === 0}
          className="bg-orange-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-xl text-sm transition-opacity"
        >
          Save
        </button>
      </div>

      {/* Workout meta */}
      <div className="space-y-3 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Workout title"
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-base focus:outline-none focus:border-orange-500 transition-colors font-semibold"
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes (optional)"
          rows={2}
          className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors resize-none"
        />

        <div className="flex gap-2">
          <div className="flex-1">
            <p className="text-xs text-zinc-500 mb-2">How do you feel?</p>
            <div className="flex gap-2">
              {FEELING_OPTIONS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setFeeling(feeling === f.value ? "" : f.value)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    feeling === f.value
                      ? "bg-orange-500/20 border border-orange-500/50 text-orange-400"
                      : "bg-zinc-900 border border-zinc-800 text-zinc-400"
                  }`}
                >
                  {f.emoji} {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIsDeload(!isDeload)}
            className={`w-10 h-6 rounded-full transition-colors ${
              isDeload ? "bg-blue-500" : "bg-zinc-700"
            } relative`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                isDeload ? "translate-x-5" : "translate-x-1"
              }`}
            />
          </div>
          <span className="text-zinc-400 text-sm">Deload week</span>
        </label>
      </div>

      {/* Exercise logger */}
      <ExerciseLogger exercises={exercises} setExercises={setExercises} />
    </div>
  );
}
