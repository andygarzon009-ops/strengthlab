"use client";

import { createWorkout, updateWorkout } from "@/lib/actions/workouts";
import { WORKOUT_TYPES, FEELING_OPTIONS } from "@/lib/exercises";
import ExerciseLogger from "@/components/ExerciseLogger";
import { useTransition, useState } from "react";
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

export type WorkoutFormInitial = {
  id: string;
  title: string;
  type: string;
  date: string;
  notes: string;
  feeling: string;
  isDeload: boolean;
  exercises: ExerciseData[];
};

function toDateInput(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function WorkoutForm({
  mode,
  initial,
  backHref = "/",
}: {
  mode: "create" | "edit";
  initial?: WorkoutFormInitial;
  backHref?: string;
}) {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);

  const [step, setStep] = useState<"type" | "log">(
    mode === "edit" ? "log" : "type"
  );
  const [workoutType, setWorkoutType] = useState(initial?.type ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [feeling, setFeeling] = useState(initial?.feeling ?? "");
  const [isDeload, setIsDeload] = useState(initial?.isDeload ?? false);
  const [date, setDate] = useState<string>(
    initial ? toDateInput(initial.date) : toDateInput(new Date().toISOString())
  );
  const [exercises, setExercises] = useState<ExerciseData[]>(
    initial?.exercises ?? []
  );

  const handleTypeSelect = (type: string) => {
    setWorkoutType(type);
    const label = WORKOUT_TYPES.find((t) => t.value === type)?.label ?? type;
    setTitle(`${label} Day`);
    setStep("log");
  };

  const handleSave = () => {
    if (!title || exercises.length === 0) return;
    setPending(true);

    const payload = {
      title,
      type: workoutType,
      date: new Date(`${date}T12:00:00`).toISOString(),
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
    };

    startTransition(async () => {
      if (mode === "edit" && initial) {
        await updateWorkout(initial.id, payload);
      } else {
        await createWorkout(payload);
      }
    });
  };

  if (step === "type" && mode === "create") {
    return (
      <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
        <div className="flex items-center gap-2 mb-8">
          <Link
            href={backHref}
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
          </Link>
          <div>
            <p className="label">Step 1 of 2</p>
            <h1 className="text-[22px] font-bold tracking-tight leading-none mt-1">
              Pick your split
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {WORKOUT_TYPES.map((type, i) => (
            <button
              key={type.value}
              onClick={() => handleTypeSelect(type.value)}
              className="card p-5 text-left transition-all active:scale-[0.97]"
            >
              <span
                className="label text-[9px] block mb-3 nums"
                style={{
                  color: "var(--fg-dim)",
                  fontFamily: "var(--font-geist-mono)",
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="font-semibold text-[17px] tracking-tight block">
                {type.label}
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
        {mode === "create" ? (
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
        ) : (
          <Link
            href={backHref}
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
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <p className="label">
            {mode === "edit" ? "Editing" : "Live Session"}
          </p>
          <h1 className="text-[18px] font-bold tracking-tight leading-none mt-0.5 truncate">
            {title || "Workout"}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!title || exercises.length === 0 || pending}
          className="btn-accent px-4 py-2 rounded-xl text-[13px]"
        >
          {pending ? "Saving…" : "Save"}
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

        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <p className="label mb-1.5">Date</p>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none nums"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontFamily: "var(--font-geist-mono)",
                colorScheme: "dark",
              }}
            />
          </div>
          <div>
            <p className="label mb-1.5">Type</p>
            <select
              value={workoutType}
              onChange={(e) => setWorkoutType(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none appearance-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.75rem center",
                paddingRight: "2rem",
              }}
            >
              {WORKOUT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

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
                          border: "1px solid rgba(34,197,94,0.4)",
                          color: "var(--accent)",
                        }
                      : {
                          background: "var(--bg-card)",
                          border: "1px solid var(--border)",
                          color: "var(--fg-muted)",
                        }
                  }
                >
                  {f.label}
                </button>
              );
            })}
          </div>
        </div>

        <label className="flex items-center justify-between cursor-pointer py-1">
          <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
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
