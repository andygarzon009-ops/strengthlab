"use client";

import {
  createCustomExercise,
  updateExercise,
  deleteCustomExercise,
} from "@/lib/actions/exercises";
import { STRENGTH_SPLITS, specificMuscleFor } from "@/lib/exercises";
import {
  ACTIVITY_CATEGORIES,
  activityCategory,
  cardioAliases,
  type ActivityCategory,
} from "@/lib/cardio";
import { useMemo, useState, useTransition } from "react";
import BackButton from "@/components/BackButton";

type Exercise = {
  id: string;
  name: string;
  muscleGroup: string | null;
  splits: string | null;
  isCustom: boolean;
};

// Specific muscles — used for grouping + the edit/create picker.
const MUSCLE_GROUPS = [
  "Pec Major",
  "Serratus",
  "Lats",
  "Traps",
  "Rhomboids",
  "Lower Back",
  "Teres",
  "Front Delts",
  "Side Delts",
  "Rear Delts",
  "Biceps",
  "Brachialis",
  "Triceps",
  "Forearms",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Adductors",
  "Abductors",
  "Calves",
  "Tibialis",
  "Abs",
  "Obliques",
  "Other",
];

// Display the specific muscle for a library row, falling back to the
// DB-stored muscleGroup for custom exercises whose name isn't pattern-matched.
const resolveMuscle = (name: string, stored: string | null): string => {
  const s = specificMuscleFor(name);
  if (s !== "Other") return s;
  return stored && stored.trim() !== "" ? stored : "Other";
};

export default function ExerciseManager({
  initial,
}: {
  initial: Exercise[];
}) {
  const [filterSplit, setFilterSplit] = useState<string>("");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [openCat, setOpenCat] = useState<ActivityCategory | null>(null);

  // The library in the same six dropdowns as the logger's picker. Lifts are
  // sub-grouped by specific muscle; the split chips only narrow lifts.
  const byCat = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = {} as Record<ActivityCategory, Exercise[]>;
    for (const c of ACTIVITY_CATEGORIES) out[c.key] = [];
    for (const e of initial) {
      if (
        q &&
        !e.name.toLowerCase().includes(q) &&
        !cardioAliases(e.name).some((a) => a.toLowerCase().includes(q))
      )
        continue;
      const cat = activityCategory(e.name, e.muscleGroup);
      if (cat === "lifting" && filterSplit) {
        const splits = (e.splits ?? "").split(",").map((s) => s.trim());
        if (!splits.includes(filterSplit)) continue;
      }
      out[cat].push(e);
    }
    for (const c of ACTIVITY_CATEGORIES) out[c.key].sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [initial, search, filterSplit]);

  const liftGroups = useMemo(() => {
    const byGroup: Record<string, Exercise[]> = {};
    for (const e of byCat.lifting) {
      const mg = resolveMuscle(e.name, e.muscleGroup);
      (byGroup[mg] ??= []).push(e);
    }
    return MUSCLE_GROUPS.filter((mg) => byGroup[mg]?.length).map((mg) => ({
      group: mg,
      items: byGroup[mg],
    }));
  }, [byCat]);

  const totalShown = Object.values(byCat).reduce((n, arr) => n + arr.length, 0);
  const searching = search.trim() !== "";

  return (
    <div className="max-w-lg mx-auto px-4 pt-8">
      <div className="flex items-center gap-2 mb-6">
        <BackButton href="/profile" ariaLabel="Back to profile" />
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

      {adding && <AddExerciseForm onDone={() => setAdding(false)} />}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search exercises and activities…"
        className="w-full rounded-xl px-4 py-3 focus:outline-none mb-2"
        style={{
          fontSize: 16,
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
        }}
      />
      <p
        className="label text-[9px] nums px-1 mb-3"
        style={{ color: "var(--fg-dim)", fontFamily: "var(--font-geist-mono)" }}
      >
        {totalShown} / {initial.length} shown
      </p>

      <div className="space-y-2.5">
        {ACTIVITY_CATEGORIES.map((c) => {
          const items = byCat[c.key];
          // Searching opens every section with a hit and hides the rest.
          if (items.length === 0 && (searching || c.key !== "lifting" || !filterSplit)) return null;
          const isOpen = searching || openCat === c.key;
          return (
            <div
              key={c.key}
              className="rounded-2xl overflow-hidden"
              style={{
                background: isOpen
                  ? `linear-gradient(180deg, rgba(${c.tint},0.08) 0%, var(--bg-card) 120px)`
                  : "var(--bg-card)",
                border: `1px solid ${isOpen ? `rgba(${c.tint},0.35)` : "var(--border)"}`,
              }}
            >
              <button
                type="button"
                onClick={() => setOpenCat(openCat === c.key ? null : c.key)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-3.5 py-3 text-left active:opacity-80"
              >
                <span
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-[21px] shrink-0"
                  style={{ background: `rgba(${c.tint},0.16)` }}
                  aria-hidden
                >
                  {c.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-bold tracking-tight">{c.label}</span>
                  <span className="block text-[12px] mt-0.5 truncate" style={{ color: "var(--fg-muted)" }}>
                    {c.blurb}
                  </span>
                </span>
                <span className="text-[12px] tabular-nums shrink-0" style={{ color: "var(--fg-dim)" }}>
                  {items.length}
                </span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--fg-dim)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  className="shrink-0"
                  style={{ transform: isOpen ? "rotate(180deg)" : undefined, transition: "transform 160ms" }}
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>

              {isOpen && (
                <div className="pb-1.5" style={{ borderTop: "1px solid var(--border)" }}>
                  {c.key === "lifting" && (
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-hide px-3.5 py-2.5">
                      <FilterChip label="All" active={filterSplit === ""} onClick={() => setFilterSplit("")} />
                      {STRENGTH_SPLITS.map((s) => (
                        <FilterChip
                          key={s.value}
                          label={s.label}
                          active={filterSplit === s.value}
                          onClick={() => setFilterSplit(s.value)}
                        />
                      ))}
                    </div>
                  )}
                  {(c.key === "lifting" ? liftGroups : [{ group: "", items }]).map(({ group, items: list }) => (
                    <div key={group || c.key}>
                      {group && (
                        <p className="label text-[10px] px-3.5 pt-2.5 pb-1" style={{ color: "var(--fg-dim)" }}>
                          {group}
                        </p>
                      )}
                      {list.map((ex) => (
                        <ExerciseRow key={ex.id} exercise={ex} />
                      ))}
                    </div>
                  ))}
                  {c.key === "lifting" && items.length === 0 && (
                    <p className="text-[13px] px-3.5 py-3" style={{ color: "var(--fg-muted)" }}>
                      No lifts tagged with that split.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {totalShown === 0 && searching && (
          <div className="card p-6 text-center" style={{ color: "var(--fg-muted)" }}>
            <p className="text-[13px]">No exercises match. Tap + New to add it.</p>
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

const SELECT_STYLE: React.CSSProperties = {
  fontSize: 16,
  background: "var(--bg-elevated)",
  border: "1px solid var(--border)",
  color: "var(--fg)",
  backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 0.75rem center",
  paddingRight: "2rem",
};

const chipStyle = (active: boolean, tint = "34,197,94"): React.CSSProperties =>
  active
    ? { background: `rgba(${tint},0.16)`, color: "var(--fg)", border: `1px solid rgba(${tint},0.5)` }
    : { background: "var(--bg-elevated)", color: "var(--fg-muted)", border: "1px solid var(--border)" };

/// Where a custom exercise lives. Lifts pick a muscle and split; anything
/// else is a timed card and only needs its category.
function CategoryFields({
  cat,
  setCat,
  muscleGroup,
  setMuscleGroup,
  split,
  setSplit,
}: {
  cat: ActivityCategory;
  setCat: (c: ActivityCategory) => void;
  muscleGroup: string;
  setMuscleGroup: (m: string) => void;
  split: string;
  setSplit: (s: string) => void;
}) {
  return (
    <>
      <p className="label mb-1.5">Category</p>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {ACTIVITY_CATEGORIES.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setCat(c.key)}
            className="flex items-center gap-2 px-2.5 h-10 rounded-xl text-[12px] font-semibold text-left"
            style={chipStyle(cat === c.key, c.tint)}
          >
            <span aria-hidden>{c.emoji}</span>
            <span className="truncate">{c.label}</span>
          </button>
        ))}
      </div>
      {cat === "lifting" ? (
        <>
          <p className="label mb-1.5">Muscle group</p>
          <select
            value={muscleGroup}
            onChange={(e) => setMuscleGroup(e.target.value)}
            className="w-full rounded-xl px-4 py-2.5 mb-3 focus:outline-none appearance-none"
            style={SELECT_STYLE}
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
            {STRENGTH_SPLITS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setSplit(split === s.value ? "" : s.value)}
                className="px-3 py-1.5 rounded-full text-[11px] font-semibold label transition-all"
                style={chipStyle(split === s.value)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-[12px] mb-4" style={{ color: "var(--fg-muted)" }}>
          {cat === "conditioning"
            ? "Logs as a rounds × work / rest card."
            : cat === "outdoor" || cat === "machine"
              ? "Logs as a timed card: time, distance, calories."
              : "Logs as a timed card: time and calories."}
        </p>
      )}
    </>
  );
}

/// What to save for a category choice: lifts keep their muscle and split;
/// activities are filed under their category's group and tagged CARDIO.
const fieldsFor = (cat: ActivityCategory, muscleGroup: string, split: string) => {
  const c = ACTIVITY_CATEGORIES.find((x) => x.key === cat);
  return cat === "lifting"
    ? { muscleGroup: muscleGroup || undefined, splits: split || undefined }
    : { muscleGroup: c?.group ?? "Cardio", splits: "CARDIO" };
};

function ExerciseRow({ exercise }: { exercise: Exercise }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const validValues = STRENGTH_SPLITS.map((s) => s.value);
  const firstValidSplit =
    (exercise.splits ?? "")
      .split(",")
      .map((s) => s.trim())
      .find((s) => validValues.includes(s)) ?? "";
  const startCat = activityCategory(exercise.name, exercise.muscleGroup);
  const [cat, setCat] = useState<ActivityCategory>(startCat);
  const [split, setSplit] = useState<string>(firstValidSplit);
  const [muscleGroup, setMuscleGroup] = useState(
    startCat === "lifting" ? (exercise.muscleGroup ?? "") : "",
  );
  const [name, setName] = useState(exercise.name);
  // A built-in activity's category comes from the catalog — only lifts and
  // your own customs can be re-filed.
  const canRefile = exercise.isCustom || startCat === "lifting";

  const save = () => {
    startTransition(async () => {
      await updateExercise(exercise.id, {
        name,
        ...(canRefile
          ? (() => {
              const f = fieldsFor(cat, muscleGroup, split);
              return { muscleGroup: f.muscleGroup, splits: f.splits ?? "" };
            })()
          : {}),
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
      <div className="mx-2 my-1.5 p-3.5 rounded-xl animate-slide-up" style={{ background: "var(--bg)", border: "1px solid var(--border-strong)" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Name"
          className="w-full rounded-xl px-4 py-2.5 font-semibold mb-3 focus:outline-none"
          style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--fg)" }}
        />
        {canRefile && (
          <CategoryFields
            cat={cat}
            setCat={setCat}
            muscleGroup={muscleGroup}
            setMuscleGroup={setMuscleGroup}
            split={split}
            setSplit={setSplit}
          />
        )}
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={pending || !name.trim()}
            className="btn-accent flex-1 py-2.5 rounded-xl text-[13px]"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="btn-ghost px-4 rounded-xl text-[13px]">
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
      className="w-full text-left px-3.5 py-3 flex items-center justify-between gap-3 active:opacity-70"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <span className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[14px] font-medium truncate">{exercise.name}</span>
        {exercise.isCustom && (
          <span className="label text-[9px] shrink-0" style={{ color: "var(--accent)" }}>
            Custom
          </span>
        )}
      </span>
      {displaySplit && (
        <span
          className="label text-[9px] px-1.5 py-0.5 rounded shrink-0"
          style={{ background: "var(--bg-elevated)", color: "var(--fg-muted)" }}
        >
          {displaySplit}
        </span>
      )}
    </button>
  );
}

function AddExerciseForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [cat, setCat] = useState<ActivityCategory>("lifting");
  const [muscleGroup, setMuscleGroup] = useState("");
  const [split, setSplit] = useState<string>("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      await createCustomExercise({ name: name.trim(), ...fieldsFor(cat, muscleGroup, split) });
      onDone();
    });
  };

  return (
    <div className="card p-4 mb-4 animate-slide-up">
      <p className="label mb-3">New exercise or activity</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Name (e.g. Reverse-Grip Bench, Padel)"
        autoFocus
        className="w-full rounded-xl px-4 py-2.5 font-semibold mb-3 focus:outline-none"
        style={{ fontSize: 16, background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--fg)" }}
      />
      <CategoryFields
        cat={cat}
        setCat={setCat}
        muscleGroup={muscleGroup}
        setMuscleGroup={setMuscleGroup}
        split={split}
        setSplit={setSplit}
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={pending || !name.trim()}
          className="btn-accent flex-1 py-2.5 rounded-xl text-[13px]"
        >
          {pending ? "Saving…" : "Create"}
        </button>
        <button onClick={onDone} className="btn-ghost px-4 rounded-xl text-[13px]">
          Cancel
        </button>
      </div>
    </div>
  );
}
