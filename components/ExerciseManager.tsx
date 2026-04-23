"use client";

import {
  createCustomExercise,
  updateExercise,
  deleteCustomExercise,
} from "@/lib/actions/exercises";
import { STRENGTH_SPLITS } from "@/lib/exercises";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

type Exercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  splits: string | null;
  isCustom: boolean;
};

const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Forearms",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Other",
];

export default function ExerciseManager({
  initial,
}: {
  initial: Exercise[];
}) {
  const router = useRouter();
  const [filterSplit, setFilterSplit] = useState<string>("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = initial.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (filterSplit) {
        const splits = (e.splits ?? "").split(",").map((s) => s.trim());
        if (!splits.includes(filterSplit)) return false;
      }
      return true;
    });
    const byGroup: Record<string, Exercise[]> = {};
    for (const e of filtered) {
      const mg = e.muscleGroup ?? "Other";
      if (!byGroup[mg]) byGroup[mg] = [];
      byGroup[mg].push(e);
    }
    return byGroup;
  }, [initial, search, filterSplit]);

  const totalShown = Object.values(grouped).reduce(
    (n, arr) => n + arr.length,
    0
  );

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="flex items-center gap-2 mb-6">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Back"
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
          <p className="label">Library</p>
          <h1 className="text-[22px] font-bold tracking-tight leading-none mt-0.5">
            Exercises
          </h1>
        </div>
        <button
          onClick={() => setAdding(!adding)}
          className="btn-accent px-3 py-2 rounded-xl text-[13px]"
        >
          {adding ? "Cancel" : "+ New"}
        </button>
      </div>

      {adding && (
        <AddExerciseForm
          onDone={() => setAdding(false)}
        />
      )}

      {/* Search + filter */}
      <div className="space-y-2 mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search exercises…"
          className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
          <FilterChip
            label="All"
            active={filterSplit === ""}
            onClick={() => setFilterSplit("")}
          />
          {STRENGTH_SPLITS.map((s) => (
            <FilterChip
              key={s.value}
              label={s.label}
              active={filterSplit === s.value}
              onClick={() => setFilterSplit(s.value)}
            />
          ))}
        </div>
        <p
          className="label text-[9px] nums px-1"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {totalShown} / {initial.length} shown
        </p>
      </div>

      {/* Grouped list */}
      <div className="space-y-5">
        {MUSCLE_GROUPS.map((mg) => {
          const list = grouped[mg];
          if (!list || list.length === 0) return null;
          return (
            <div key={mg}>
              <h2 className="label mb-2 px-1">{mg}</h2>
              <div className="space-y-2">
                {list.map((ex) => (
                  <ExerciseRow key={ex.id} exercise={ex} />
                ))}
              </div>
            </div>
          );
        })}
        {totalShown === 0 && (
          <div
            className="card p-6 text-center"
            style={{ color: "var(--fg-muted)" }}
          >
            <p className="text-[13px]">No exercises match.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all label"
      style={
        active
          ? {
              background: "var(--accent-dim)",
              color: "var(--accent)",
              border: "1px solid rgba(34,197,94,0.35)",
            }
          : {
              background: "var(--bg-card)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border)",
            }
      }
    >
      {label}
    </button>
  );
}

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const validValues = STRENGTH_SPLITS.map((s) => s.value);
  const firstValidSplit = (exercise.splits ?? "")
    .split(",")
    .map((s) => s.trim())
    .find((s) => validValues.includes(s)) ?? "";
  const [split, setSplit] = useState<string>(firstValidSplit);
  const [muscleGroup, setMuscleGroup] = useState(exercise.muscleGroup ?? "");
  const [name, setName] = useState(exercise.name);

  const save = () => {
    startTransition(async () => {
      await updateExercise(exercise.id, {
        name,
        muscleGroup: muscleGroup || undefined,
        splits: split,
      });
      setEditing(false);
    });
  };

  const remove = () => {
    if (!confirm(`Delete "${exercise.name}"?`)) return;
    startTransition(async () => {
      await deleteCustomExercise(exercise.id);
    });
  };

  const displaySplit =
    STRENGTH_SPLITS.find((s) => s.value === firstValidSplit)?.label ?? null;

  if (editing) {
    return (
      <div className="card p-4 animate-slide-up">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-[14px] font-semibold mb-3 focus:outline-none"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />
        <p className="label mb-1.5">Muscle group</p>
        <select
          value={muscleGroup}
          onChange={(e) => setMuscleGroup(e.target.value)}
          className="w-full rounded-xl px-4 py-2.5 text-[14px] mb-3 focus:outline-none appearance-none"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: "right 0.75rem center",
            paddingRight: "2rem",
          }}
        >
          <option value="">—</option>
          {MUSCLE_GROUPS.map((mg) => (
            <option key={mg} value={mg}>
              {mg}
            </option>
          ))}
        </select>

        <p className="label mb-1.5">Split</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {STRENGTH_SPLITS.map((s) => {
            const active = split === s.value;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSplit(active ? "" : s.value)}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold label transition-all"
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

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={pending || !name.trim()}
            className="btn-accent flex-1 py-2.5 rounded-xl text-[13px]"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="btn-ghost px-4 rounded-xl text-[13px]"
          >
            Cancel
          </button>
          {exercise.isCustom && (
            <button
              onClick={remove}
              disabled={pending}
              className="px-4 rounded-xl text-[13px] font-medium"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#f87171",
              }}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="card p-3.5 w-full text-left transition-all active:scale-[0.98]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-[14px] font-medium truncate">{exercise.name}</span>
          {exercise.isCustom && (
            <span
              className="label text-[9px] shrink-0"
              style={{ color: "var(--accent)" }}
            >
              Custom
            </span>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          {displaySplit && (
            <span
              className="label text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--fg-muted)",
              }}
            >
              {displaySplit}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function AddExerciseForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [split, setSplit] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      await createCustomExercise({
        name: name.trim(),
        muscleGroup: muscleGroup || undefined,
        splits: split || undefined,
      });
      onDone();
    });
  };

  return (
    <div className="card p-4 mb-4 animate-slide-up">
      <p className="label mb-3">New exercise</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Reverse-Grip Bench)"
        autoFocus
        className="w-full rounded-xl px-4 py-2.5 text-[14px] font-semibold mb-3 focus:outline-none"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
        }}
      />
      <p className="label mb-1.5">Muscle group</p>
      <select
        value={muscleGroup}
        onChange={(e) => setMuscleGroup(e.target.value)}
        className="w-full rounded-xl px-4 py-2.5 text-[14px] mb-3 focus:outline-none appearance-none"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 0.75rem center",
          paddingRight: "2rem",
        }}
      >
        <option value="">—</option>
        {MUSCLE_GROUPS.map((mg) => (
          <option key={mg} value={mg}>
            {mg}
          </option>
        ))}
      </select>
      <p className="label mb-1.5">Split</p>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {STRENGTH_SPLITS.map((s) => {
          const active = split === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setSplit(active ? "" : s.value)}
              className="px-3 py-1.5 rounded-full text-[11px] font-semibold label transition-all"
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
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={pending || !name.trim()}
          className="btn-accent flex-1 py-2.5 rounded-xl text-[13px]"
        >
          {pending ? "Saving…" : "Create"}
        </button>
        <button
          onClick={onDone}
          className="btn-ghost px-4 rounded-xl text-[13px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
