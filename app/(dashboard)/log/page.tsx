"use client";

import { createWorkout } from "@/lib/actions/workouts";
import { WORKOUT_TYPES, FEELING_OPTIONS } from "@/lib/exercises";
import ExerciseLogger from "@/components/ExerciseLogger";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
      <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
        <div className="flex items-center gap-2 mb-8">
          <Link
            href="/"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border)",
              color: "var(--fg-muted)",
            }}
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
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <p className="label">Step 1 of 2</p>
            <h1 className="text-[22px] font-bold tracking-tight leading-none mt-1">
              Pick your split
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {WORKOUT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => handleTypeSelect(type.value)}
              className="card p-5 text-left transition-all active:scale-[0.97] hover:border-zinc-700"
            >
              <span className="text-2xl block mb-3">{type.emoji}</span>
              <span className="font-semibold text-[15px] tracking-tight block">
                {type.label}
              </span>
              <span
                className="label text-[9px] mt-1 block"
                style={{ color: "var(--fg-dim)" }}
              >
                {type.value}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-2 mb-6">
        <button
          onClick={() => setStep("type")}
          className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg-muted)",
          }}
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
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <p className="label">Live Session</p>
          <h1 className="text-[18px] font-bold tracking-tight leading-none mt-0.5">
            {title || "Workout"}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!title || exercises.length === 0}
          className="btn-accent px-4 py-2 rounded-xl text-[13px]"
        >
          Save
        </button>
      </div>

      <div className="space-y-2.5 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Workout title"
          className="w-full rounded-xl px-4 py-3 text-[15px] focus:outline-none font-semibold tracking-tight"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Session notes…"
          rows={2}
          className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />

        <div>
          <p className="label mb-2">Feeling</p>
          <div className="flex gap-2">
            {FEELING_OPTIONS.map((f) => {
              const selected = feeling === f.value;
              return (
                <button
                  key={f.value}
                  onClick={() => setFeeling(selected ? "" : f.value)}
                  className="flex-1 py-2.5 rounded-xl text-[12px] font-medium transition-all"
                  style={
                    selected
                      ? {
                          background: "var(--accent-dim)",
                          border: "1px solid rgba(255,90,31,0.4)",
                          color: "var(--accent)",
                        }
                      : {
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--fg-muted)",
                        }
                  }
                >
                  <span className="mr-1">{f.emoji}</span>
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center justify-between cursor-pointer py-1">
          <span
            className="text-[13px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Deload week
          </span>
          <button
            type="button"
            onClick={() => setIsDeload(!isDeload)}
            className="w-10 h-6 rounded-full relative transition-colors"
            style={{
              background: isDeload ? "var(--accent)" : "var(--border-strong)",
            }}
          >
            <div
              className="w-4 h-4 rounded-full absolute top-1 transition-transform"
              style={{
                background: "#fff",
                transform: isDeload ? "translateX(22px)" : "translateX(4px)",
              }}
            />
          </button>
        </label>
      </div>

      <ExerciseLogger exercises={exercises} setExercises={setExercises} />
    </div>
  );
}
