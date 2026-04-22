"use client";

import {
  createWorkout,
  updateWorkout,
  type CreateWorkoutInput,
} from "@/lib/actions/workouts";
import {
  WORKOUT_TYPES,
  STRENGTH_SPLITS,
  FEELING_OPTIONS,
  shapeForType,
  labelForType,
  type WorkoutShape,
} from "@/lib/exercises";
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
  split: string | null;
  date: string;
  notes: string;
  feeling: string;
  isDeload: boolean;
  exercises: ExerciseData[];
  duration: number | null;
  distance: number | null;
  pace: string | null;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  rounds: number | null;
  elevation: number | null;
  rpe: number | null;
};

function toDateInput(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function titleFor(type: string, split?: string) {
  if (type === "WEIGHT_TRAINING") {
    const splitLabel = STRENGTH_SPLITS.find((s) => s.value === split)?.label;
    return splitLabel ? `${splitLabel} Day` : "Weight Training";
  }
  return labelForType(type);
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
  const [split, setSplit] = useState(initial?.split ?? "");
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

  // Shape-specific metrics
  const [durationMin, setDurationMin] = useState(
    initial?.duration ? String(Math.floor(initial.duration / 60)) : ""
  );
  const [durationSec, setDurationSec] = useState(
    initial?.duration ? String(initial.duration % 60) : ""
  );
  const [distance, setDistance] = useState(
    initial?.distance?.toString() ?? ""
  );
  const [pace, setPace] = useState(initial?.pace ?? "");
  const [avgHR, setAvgHR] = useState(initial?.avgHeartRate?.toString() ?? "");
  const [maxHR, setMaxHR] = useState(initial?.maxHeartRate?.toString() ?? "");
  const [rounds, setRounds] = useState(initial?.rounds?.toString() ?? "");
  const [elevation, setElevation] = useState(
    initial?.elevation?.toString() ?? ""
  );
  const [rpe, setRpe] = useState(initial?.rpe?.toString() ?? "");

  const shape: WorkoutShape = workoutType ? shapeForType(workoutType) : "STRENGTH";

  const handleTypeSelect = (type: string) => {
    setWorkoutType(type);
    setTitle(titleFor(type, split));
    setStep("log");
  };

  const handleSplitSelect = (s: string) => {
    setSplit(s);
    if (workoutType === "WEIGHT_TRAINING") {
      setTitle(titleFor(workoutType, s));
    }
  };

  // Strength sets with weight but missing reps block save
  const missingRepsCount =
    shape === "STRENGTH"
      ? exercises.reduce((count, ex) => {
          return (
            count +
            ex.sets.filter(
              (s) =>
                s.type === "WORKING" &&
                s.weight.trim() !== "" &&
                parseFloat(s.weight) > 0 &&
                s.reps.trim() === ""
            ).length
          );
        }, 0)
      : 0;

  const canSave = (() => {
    if (!title) return false;
    if (shape === "STRENGTH") {
      return exercises.length > 0 && missingRepsCount === 0;
    }
    if (shape === "DISTANCE") {
      return (
        (distance && parseFloat(distance) > 0) ||
        (durationMin && parseInt(durationMin) > 0)
      );
    }
    if (shape === "DURATION") {
      return (
        (durationMin && parseInt(durationMin) > 0) ||
        (durationSec && parseInt(durationSec) > 0)
      );
    }
    return false;
  })();

  const handleSave = () => {
    if (!canSave) return;
    setPending(true);

    const durationSeconds =
      (parseInt(durationMin || "0") || 0) * 60 +
      (parseInt(durationSec || "0") || 0);

    const payload: CreateWorkoutInput = {
      title,
      type: workoutType,
      split: shape === "STRENGTH" ? split || null : null,
      date: new Date(`${date}T12:00:00`).toISOString(),
      notes: notes || undefined,
      feeling: feeling || undefined,
      isDeload,
      duration: durationSeconds > 0 ? durationSeconds : null,
      distance:
        shape === "DISTANCE" && distance ? parseFloat(distance) : null,
      pace: shape === "DISTANCE" && pace ? pace : null,
      avgHeartRate: avgHR ? parseInt(avgHR) : null,
      maxHeartRate: maxHR ? parseInt(maxHR) : null,
      rounds: shape === "DURATION" && rounds ? parseInt(rounds) : null,
      elevation:
        shape === "DISTANCE" && elevation ? parseInt(elevation) : null,
      rpe: rpe ? parseInt(rpe) : null,
      exercises:
        shape === "STRENGTH"
          ? exercises.map((ex, i) => ({
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
            }))
          : [],
    };

    startTransition(async () => {
      if (mode === "edit" && initial) {
        await updateWorkout(initial.id, payload);
      } else {
        await createWorkout(payload);
      }
    });
  };

  // STEP 1: Pick type
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
            <BackIcon />
          </Link>
          <div>
            <p className="label">Step 1 of 2</p>
            <h1 className="text-[22px] font-bold tracking-tight leading-none mt-1">
              Session type
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {WORKOUT_TYPES.map((type) => (
            <button
              key={type.value}
              onClick={() => handleTypeSelect(type.value)}
              className="card p-4 flex items-center justify-between text-left transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <TypeIcon type={type.value} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-[15px] tracking-tight truncate">
                    {type.label}
                  </p>
                  <p
                    className="text-[11px] mt-0.5"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    {shapeHint(type.shape)}
                  </p>
                </div>
              </div>
              <span style={{ color: "var(--fg-dim)" }}>›</span>
            </button>
          ))}
        </div>

        <p
          className="text-center text-[12px] mt-8"
          style={{ color: "var(--fg-dim)" }}
        >
          Forgot a session? You can backdate to any past day on the next step.
        </p>
      </div>
    );
  }

  // STEP 2: Log details
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
            <BackIcon />
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
            <BackIcon />
          </Link>
        )}
        <div className="flex-1 min-w-0">
          <p className="label">{labelForType(workoutType)}</p>
          <h1 className="text-[18px] font-bold tracking-tight leading-none mt-0.5 truncate">
            {title || "Session"}
          </h1>
        </div>
        <button
          onClick={handleSave}
          disabled={!canSave || pending}
          className="btn-accent px-4 py-2 rounded-xl text-[13px]"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>

      {missingRepsCount > 0 && (
        <div
          className="mb-3 px-4 py-2.5 rounded-xl flex items-center gap-2.5"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#f87171"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <p className="text-[12px] leading-snug" style={{ color: "#fca5a5" }}>
            <span className="font-semibold">
              {missingRepsCount} set{missingRepsCount === 1 ? "" : "s"} missing
              reps.
            </span>{" "}
            Fill them in to save.
          </p>
        </div>
      )}

      <DateSelector date={date} setDate={setDate} />

      <div className="space-y-2.5 mb-6">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Session title"
          className="w-full rounded-xl px-4 py-3 text-[15px] focus:outline-none font-semibold tracking-tight"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />

        {/* Type + (split, if strength) */}
        <div
          className={
            shape === "STRENGTH" ? "grid grid-cols-2 gap-2.5" : undefined
          }
        >
          <div>
            <p className="label mb-1.5">Type</p>
            <Select
              value={workoutType}
              onChange={(v) => {
                setWorkoutType(v);
                if (title.trim() === "" || title === labelForType(workoutType))
                  setTitle(titleFor(v, split));
              }}
              options={WORKOUT_TYPES.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
            />
          </div>
          {shape === "STRENGTH" && (
            <div>
              <p className="label mb-1.5">Split</p>
              <Select
                value={split}
                onChange={handleSplitSelect}
                options={[
                  { value: "", label: "—" },
                  ...STRENGTH_SPLITS.map((s) => ({
                    value: s.value,
                    label: s.label,
                  })),
                ]}
              />
            </div>
          )}
        </div>

        {/* Shape-specific metrics */}
        {shape === "DISTANCE" && (
          <DistanceMetrics
            distance={distance}
            setDistance={setDistance}
            durationMin={durationMin}
            setDurationMin={setDurationMin}
            durationSec={durationSec}
            setDurationSec={setDurationSec}
            pace={pace}
            setPace={setPace}
            elevation={elevation}
            setElevation={setElevation}
            avgHR={avgHR}
            setAvgHR={setAvgHR}
            maxHR={maxHR}
            setMaxHR={setMaxHR}
          />
        )}

        {shape === "DURATION" && (
          <DurationMetrics
            durationMin={durationMin}
            setDurationMin={setDurationMin}
            durationSec={durationSec}
            setDurationSec={setDurationSec}
            rounds={rounds}
            setRounds={setRounds}
            rpe={rpe}
            setRpe={setRpe}
            avgHR={avgHR}
            setAvgHR={setAvgHR}
            maxHR={maxHR}
            setMaxHR={setMaxHR}
            showRounds={
              workoutType === "HIIT" || workoutType === "COMBAT"
            }
          />
        )}

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

        {shape === "STRENGTH" && (
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
                background: isDeload
                  ? "var(--accent)"
                  : "var(--border-strong)",
              }}
            >
              <div
                className="w-4 h-4 rounded-full absolute top-1 transition-transform"
                style={{
                  background: "#fff",
                  transform: isDeload
                    ? "translateX(22px)"
                    : "translateX(4px)",
                }}
              />
            </button>
          </label>
        )}
      </div>

      {shape === "STRENGTH" && (
        <ExerciseLogger
          exercises={exercises}
          setExercises={setExercises}
          currentSplit={split || undefined}
        />
      )}
    </div>
  );
}

/* ---------------- Shape: Distance ---------------- */

function DistanceMetrics(props: {
  distance: string;
  setDistance: (v: string) => void;
  durationMin: string;
  setDurationMin: (v: string) => void;
  durationSec: string;
  setDurationSec: (v: string) => void;
  pace: string;
  setPace: (v: string) => void;
  elevation: string;
  setElevation: (v: string) => void;
  avgHR: string;
  setAvgHR: (v: string) => void;
  maxHR: string;
  setMaxHR: (v: string) => void;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <LabeledInput
          label="Distance"
          suffix="km"
          type="number"
          inputMode="decimal"
          value={props.distance}
          onChange={props.setDistance}
          placeholder="5.0"
        />
        <DurationInput
          min={props.durationMin}
          setMin={props.setDurationMin}
          sec={props.durationSec}
          setSec={props.setDurationSec}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <LabeledInput
          label="Pace"
          suffix="/km"
          value={props.pace}
          onChange={props.setPace}
          placeholder="5:30"
        />
        <LabeledInput
          label="Elevation"
          suffix="m"
          type="number"
          value={props.elevation}
          onChange={props.setElevation}
          placeholder="120"
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <LabeledInput
          label="Avg HR"
          suffix="bpm"
          type="number"
          value={props.avgHR}
          onChange={props.setAvgHR}
          placeholder="155"
        />
        <LabeledInput
          label="Max HR"
          suffix="bpm"
          type="number"
          value={props.maxHR}
          onChange={props.setMaxHR}
          placeholder="178"
        />
      </div>
    </div>
  );
}

/* ---------------- Shape: Duration ---------------- */

function DurationMetrics(props: {
  durationMin: string;
  setDurationMin: (v: string) => void;
  durationSec: string;
  setDurationSec: (v: string) => void;
  rounds: string;
  setRounds: (v: string) => void;
  rpe: string;
  setRpe: (v: string) => void;
  avgHR: string;
  setAvgHR: (v: string) => void;
  maxHR: string;
  setMaxHR: (v: string) => void;
  showRounds: boolean;
}) {
  return (
    <div className="card p-4 space-y-3">
      <div className="grid grid-cols-2 gap-2.5">
        <DurationInput
          min={props.durationMin}
          setMin={props.setDurationMin}
          sec={props.durationSec}
          setSec={props.setDurationSec}
        />
        {props.showRounds ? (
          <LabeledInput
            label="Rounds"
            type="number"
            value={props.rounds}
            onChange={props.setRounds}
            placeholder="8"
          />
        ) : (
          <LabeledInput
            label="RPE"
            suffix="/10"
            type="number"
            value={props.rpe}
            onChange={props.setRpe}
            placeholder="7"
          />
        )}
      </div>
      {props.showRounds && (
        <LabeledInput
          label="RPE"
          suffix="/10"
          type="number"
          value={props.rpe}
          onChange={props.setRpe}
          placeholder="7"
        />
      )}
      <div className="grid grid-cols-2 gap-2.5">
        <LabeledInput
          label="Avg HR"
          suffix="bpm"
          type="number"
          value={props.avgHR}
          onChange={props.setAvgHR}
          placeholder="155"
        />
        <LabeledInput
          label="Max HR"
          suffix="bpm"
          type="number"
          value={props.maxHR}
          onChange={props.setMaxHR}
          placeholder="178"
        />
      </div>
    </div>
  );
}

/* ---------------- Shared primitives ---------------- */

function LabeledInput({
  label,
  suffix,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  label: string;
  suffix?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <div>
      <p className="label mb-1.5">{label}</p>
      <div className="relative">
        <input
          type={type}
          inputMode={inputMode}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
            paddingRight: suffix ? "3rem" : undefined,
          }}
        />
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] label"
            style={{ color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function DurationInput({
  min,
  setMin,
  sec,
  setSec,
}: {
  min: string;
  setMin: (v: string) => void;
  sec: string;
  setSec: (v: string) => void;
}) {
  return (
    <div>
      <p className="label mb-1.5">Duration</p>
      <div className="flex gap-1.5 items-center">
        <input
          type="number"
          inputMode="numeric"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="45"
          className="flex-1 w-full rounded-xl px-3 py-3 text-[14px] text-center focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
        <span
          className="text-[11px] label"
          style={{ color: "var(--fg-dim)" }}
        >
          m
        </span>
        <input
          type="number"
          inputMode="numeric"
          value={sec}
          onChange={(e) => setSec(e.target.value)}
          placeholder="00"
          className="flex-1 w-full rounded-xl px-3 py-3 text-[14px] text-center focus:outline-none nums"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            fontFamily: "var(--font-geist-mono)",
          }}
        />
        <span
          className="text-[11px] label"
          style={{ color: "var(--fg-dim)" }}
        >
          s
        </span>
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ---------------- Icons + shape helpers ---------------- */

function shapeHint(shape: WorkoutShape): string {
  if (shape === "STRENGTH") return "Sets, reps, weight";
  if (shape === "DISTANCE") return "Distance, pace, duration";
  return "Duration and intensity";
}

function BackIcon() {
  return (
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
  );
}

function TypeIcon({ type }: { type: string }) {
  const stroke = "var(--fg-muted)";
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (type) {
    case "WEIGHT_TRAINING":
      return (
        <svg {...common}>
          <path d="M6 4h2v16H6zM16 4h2v16h-2zM3 8h3v8H3zM18 8h3v8h-3zM8 11h8v2H8z" />
        </svg>
      );
    case "RUNNING":
      return (
        <svg {...common}>
          <circle cx="13" cy="4" r="1.5" />
          <path d="M4 22l3-7 4-2-2-5 4-1 4 3 3-1" />
          <path d="M15 13l1 4-3 5" />
        </svg>
      );
    case "CYCLING":
      return (
        <svg {...common}>
          <circle cx="6" cy="17" r="3.5" />
          <circle cx="18" cy="17" r="3.5" />
          <path d="M6 17l4-9h4l4 9M12 8V5h2" />
        </svg>
      );
    case "SWIMMING":
      return (
        <svg {...common}>
          <path d="M3 13c2-1 4 1 6 0s4-2 6 0 4 1 6 0" />
          <path d="M3 18c2-1 4 1 6 0s4-2 6 0 4 1 6 0" />
          <circle cx="16" cy="6" r="2" />
        </svg>
      );
    case "ROWING":
      return (
        <svg {...common}>
          <path d="M4 18L20 6M8 14l2 2M14 8l2 2" />
          <circle cx="4" cy="18" r="1.5" />
          <circle cx="20" cy="6" r="1.5" />
        </svg>
      );
    case "HIIT":
      return (
        <svg {...common}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "COMBAT":
      return (
        <svg {...common}>
          <path d="M14 4v6h4v10H6V10h4V4h4z" />
          <path d="M9 13h6" />
        </svg>
      );
    case "MOBILITY":
      return (
        <svg {...common}>
          <circle cx="12" cy="5" r="2" />
          <path d="M12 7v7M8 11h8M7 22l5-8 5 8" />
        </svg>
      );
    case "SPORT":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v4M12 16h.01" />
        </svg>
      );
  }
}

/* ---------------- Date selector ---------------- */

function DateSelector({
  date,
  setDate,
}: {
  date: string;
  setDate: (d: string) => void;
}) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const twoDaysAgo = new Date();
  twoDaysAgo.setDate(today.getDate() - 2);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const shortcuts = [
    { label: "Today", value: fmt(today) },
    { label: "Yesterday", value: fmt(yesterday) },
    { label: "2 days ago", value: fmt(twoDaysAgo) },
  ];

  const display = new Date(`${date}T12:00:00`);
  const niceDate = display.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const isToday = date === fmt(today);

  return (
    <div className="card p-4 mb-3">
      <div className="flex items-baseline justify-between mb-3">
        <p className="label">Logging for</p>
        {!isToday && (
          <p
            className="label text-[9px]"
            style={{ color: "var(--accent)" }}
          >
            Backdated
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 mb-3">
        <div
          className="flex-1 nums text-[18px] font-semibold tracking-tight"
          style={{ fontFamily: "var(--font-geist-mono)" }}
        >
          {niceDate}
        </div>
        <label
          className="cursor-pointer"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            padding: "0.4rem 0.7rem",
            borderRadius: "0.5rem",
          }}
        >
          <span
            className="label text-[10px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Pick date
          </span>
          <input
            type="date"
            value={date}
            max={fmt(today)}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="sr-only"
          />
        </label>
      </div>

      <div className="flex gap-1.5">
        {shortcuts.map((s) => {
          const active = date === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setDate(s.value)}
              className="flex-1 text-[11px] py-2 rounded-lg transition-colors label"
              style={
                active
                  ? {
                      background: "var(--accent-dim)",
                      color: "var(--accent)",
                      border: "1px solid rgba(34,197,94,0.35)",
                    }
                  : {
                      background: "var(--bg-elevated)",
                      color: "var(--fg-muted)",
                      border: "1px solid var(--border)",
                    }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
