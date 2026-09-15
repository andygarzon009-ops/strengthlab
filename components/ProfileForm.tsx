"use client";

import { updateProfile as updateProfileAction } from "@/lib/actions/workouts";
import { useRef, useState, useTransition } from "react";
import ImageUpload from "@/components/ImageUpload";
import UsernameField from "@/components/UsernameField";
import PeriodizationEditor from "@/components/PeriodizationEditor";
import { type PeriodizationConfig } from "@/lib/periodization";

type UserProfile = {
  name: string;
  email: string;
  username: string | null;
  image: string | null;
  coverImage: string | null;
  bodyweight: number | null;
  birthDate: string | null;
  sex: string | null;
  preferredSplit: string | null;
  bio: string | null;
  experienceLevel: string | null;
  primaryFocus: string | null;
  trainingPhase: string | null;
  trainingDays: number | null;
  moveGoalKcal: number | null;
  exerciseGoalMin: number | null;
  injuries: string | null;
  coachPrompt: string | null;
  periodization: PeriodizationConfig | null;
  height: number | null;
  restingHR: number | null;
  waist: number | null;
  hips: number | null;
  chest: number | null;
  shoulders: number | null;
  neck: number | null;
  arm: number | null;
  forearm: number | null;
  thigh: number | null;
  calf: number | null;
};

// Body measurements are STORED in inches — the coach prompt reads them that
// way ("BODY METRICS (inches unless noted)") and so does the nutrition model.
// The cm/in switch is a display-and-entry layer over that: `form` carries
// whatever unit is on screen, and Save converts back to inches.
type MeasureUnit = "in" | "cm";
const MEASURE_UNIT_KEY = "sl:measureUnit";
const CM_PER_IN = 2.54;

// Every length field on the form. Resting HR and bodyweight are not lengths
// and never convert.
const LENGTH_FIELDS = [
  "height",
  "neck",
  "shoulders",
  "chest",
  "arm",
  "forearm",
  "waist",
  "hips",
  "thigh",
  "calf",
] as const;

// One decimal on screen: a tape measure doesn't resolve finer than that, and
// it round-trips — 15in → 38.1cm → 15.0in, 32in → 81.3cm → 32.0in — so
// flipping the switch back and forth never walks a number off its value.
const show = (n: number) => Math.round(n * 10) / 10;
const inToCm = (inches: number) => show(inches * CM_PER_IN);
const cmToIn = (cm: number) => show(cm / CM_PER_IN);

export default function ProfileForm({
  user,
  /// Local dates (YYYY-MM-DD) the athlete logged something on, so the cycle
  /// editor's preview skips untrained weeks exactly as the coach does.
  trainedDates = [],
}: {
  user: UserProfile;
  trainedDates?: string[];
}) {
  const [pending, startTransition] = useTransition();
  // Both detail sections start collapsed so the profile opens clean — tap a
  // header to expand. Form state lives in `form`, so collapsing never loses
  // edits and Save keeps working.
  const [showTraining, setShowTraining] = useState(false);
  const [showMeasurements, setShowMeasurements] = useState(false);
  const [unit, setUnit] = useState<MeasureUnit>("in");
  const [saved, setSaved] = useState(false);
  const [image, setImage] = useState<string | null>(user.image);
  const [coverImage, setCoverImage] = useState<string | null>(user.coverImage);
  // Kept outside `form` because it's a structured object, not a text field.
  const [periodization, setPeriodization] = useState<PeriodizationConfig | null>(
    user.periodization,
  );

  const [form, setForm] = useState({
    name: user.name,
    birthDate: user.birthDate ? user.birthDate.slice(0, 10) : "",
    sex: user.sex ?? "",
    bodyweight: user.bodyweight?.toString() ?? "",
    trainingDays: user.trainingDays?.toString() ?? "",
    moveGoalKcal: user.moveGoalKcal?.toString() ?? "",
    exerciseGoalMin: user.exerciseGoalMin?.toString() ?? "",
    experienceLevel: user.experienceLevel ?? "",
    primaryFocus: user.primaryFocus ?? "",
    trainingPhase: user.trainingPhase ?? "",
    preferredSplit: user.preferredSplit ?? "",
    injuries: user.injuries ?? "",
    bio: user.bio ?? "",
    coachPrompt: user.coachPrompt ?? "",
    height: user.height?.toString() ?? "",
    restingHR: user.restingHR?.toString() ?? "",
    waist: user.waist?.toString() ?? "",
    hips: user.hips?.toString() ?? "",
    chest: user.chest?.toString() ?? "",
    shoulders: user.shoulders?.toString() ?? "",
    neck: user.neck?.toString() ?? "",
    arm: user.arm?.toString() ?? "",
    forearm: user.forearm?.toString() ?? "",
    thigh: user.thigh?.toString() ?? "",
    calf: user.calf?.toString() ?? "",
  });

  const set = (key: keyof typeof form) => (v: string) =>
    setForm((s) => ({ ...s, [key]: v }));

  // Flipping the unit rewrites what's on screen; the numbers the athlete
  // already typed keep their meaning instead of being reinterpreted.
  const switchUnit = (next: MeasureUnit) => {
    if (next === unit) return;
    setForm((s) => {
      const out = { ...s };
      for (const k of LENGTH_FIELDS) {
        const v = parseFloat(s[k]);
        if (!Number.isFinite(v)) continue;
        out[k] = String(next === "cm" ? inToCm(v) : cmToIn(v));
      }
      return out;
    });
    setUnit(next);
    try {
      localStorage.setItem(MEASURE_UNIT_KEY, next);
    } catch {
      // Private windows and blocked site data — the switch still works, it
      // just won't be remembered.
    }
  };

  // The preference is per-device, so it can't be read during render without a
  // hydration mismatch. It's read when the panel is first opened instead —
  // nothing inside it is rendered while collapsed, so there's nothing to
  // convert until then, and an athlete who never opens it saves untouched
  // inches.
  const unitLoaded = useRef(false);
  const toggleMeasurements = () => {
    const opening = !showMeasurements;
    setShowMeasurements(opening);
    if (!opening || unitLoaded.current) return;
    unitLoaded.current = true;
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(MEASURE_UNIT_KEY);
    } catch {
      return;
    }
    if (stored === "cm") switchUnit("cm");
  };

  // A placeholder has to speak the unit on screen too, or "70" reads as a
  // height in centimetres.
  const ph = (inches: number) => String(unit === "cm" ? inToCm(inches) : inches);

  // Photos persist immediately on upload so they feel instant — no need to
  // hit Save. (The main Save also includes them, harmlessly.)
  const saveImage = (next: string | null) => {
    setImage(next);
    startTransition(async () => {
      await updateProfileAction({ name: form.name, image: next, coverImage });
    });
  };
  const saveCover = (next: string | null) => {
    setCoverImage(next);
    startTransition(async () => {
      await updateProfileAction({ name: form.name, image, coverImage: next });
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);

    const numOrNull = (v: string) =>
      v.trim() === "" ? null : parseFloat(v);
    const intOrNull = (v: string) =>
      v.trim() === "" ? null : parseInt(v);
    // Lengths persist in inches whatever the switch says. Two decimals is
    // finer than any tape and keeps the cm value it came from intact.
    const lengthInches = (v: string) => {
      const n = numOrNull(v);
      if (n === null || !Number.isFinite(n)) return null;
      return unit === "cm" ? Math.round((n / CM_PER_IN) * 100) / 100 : n;
    };

    startTransition(async () => {
      await updateProfileAction({
        name: form.name,
        image,
        coverImage,
        birthDate: form.birthDate || null,
        sex: form.sex || null,
        bodyweight: form.bodyweight ? parseFloat(form.bodyweight) : undefined,
        trainingDays: form.trainingDays
          ? parseInt(form.trainingDays)
          : undefined,
        moveGoalKcal: intOrNull(form.moveGoalKcal),
        exerciseGoalMin: intOrNull(form.exerciseGoalMin),
        experienceLevel: form.experienceLevel,
        primaryFocus: form.primaryFocus,
        trainingPhase: form.trainingPhase,
        preferredSplit: form.preferredSplit,
        injuries: form.injuries,
        bio: form.bio,
        coachPrompt: form.coachPrompt,
        periodization,
        height: lengthInches(form.height),
        restingHR: intOrNull(form.restingHR),
        waist: lengthInches(form.waist),
        hips: lengthInches(form.hips),
        chest: lengthInches(form.chest),
        shoulders: lengthInches(form.shoulders),
        neck: lengthInches(form.neck),
        arm: lengthInches(form.arm),
        forearm: lengthInches(form.forearm),
        thigh: lengthInches(form.thigh),
        calf: lengthInches(form.calf),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const filledMeasurements = countMeasurements(user);

  return (
    <>
      {/* Photos */}
      <div className="card p-5 mb-3">
        <h2 className="font-semibold text-[14px] tracking-tight mb-3">Photos</h2>
        <div className="mb-4">
          <ImageUpload
            kind="cover"
            shape="wide"
            value={coverImage}
            name={form.name}
            onChange={saveCover}
          />
        </div>
        <ImageUpload
          kind="avatar"
          shape="round"
          value={image}
          name={form.name}
          onChange={saveImage}
        />
        <div className="mt-4">
          <UsernameField initial={user.username} />
        </div>
      </div>

      {/* Training profile (collapsible) — styled like the other profile cards */}
      <div className="card mb-3 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTraining((v) => !v)}
          aria-expanded={showTraining}
          className="w-full flex items-center justify-between px-5 py-4 text-left"
        >
          <div className="min-w-0">
            <h2 className="font-semibold text-[14px] tracking-tight">
              Training profile
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-dim)" }}>
              Name, goals, split &amp; coaching prefs
            </p>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--fg-muted)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 ml-3"
            style={{
              transform: showTraining ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s",
            }}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
        {showTraining && (
          <form onSubmit={handleSubmit} className="space-y-3 px-5 pb-5 pt-1">
          <Field
            label="Name"
            value={form.name}
            onChange={set("name")}
          />

          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="Date of birth"
              type="date"
              value={form.birthDate}
              onChange={set("birthDate")}
            />
            <div>
              <label className="label block mb-1.5">Sex</label>
              <Select
                value={form.sex}
                onChange={set("sex")}
                options={[
                  { value: "", label: "—" },
                  { value: "MALE", label: "Male" },
                  { value: "FEMALE", label: "Female" },
                  { value: "OTHER", label: "Other / prefer not to say" },
                ]}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="Body weight"
              type="number"
              value={form.bodyweight}
              onChange={set("bodyweight")}
              placeholder="185"
              suffix="lb"
            />
            <Field
              label="Days / week"
              type="number"
              value={form.trainingDays}
              onChange={set("trainingDays")}
              placeholder="4"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field
              label="Move goal"
              type="number"
              value={form.moveGoalKcal}
              onChange={set("moveGoalKcal")}
              placeholder="500"
              suffix="kcal"
            />
            <Field
              label="Exercise goal"
              type="number"
              value={form.exerciseGoalMin}
              onChange={set("exerciseGoalMin")}
              placeholder="30"
              suffix="min"
            />
          </div>

          <div>
            <label className="label block mb-1.5">Experience</label>
            <Select
              value={form.experienceLevel}
              onChange={set("experienceLevel")}
              options={[
                { value: "", label: "—" },
                { value: "BEGINNER", label: "Beginner (<1 yr)" },
                { value: "INTERMEDIATE", label: "Intermediate (1–3 yrs)" },
                { value: "ADVANCED", label: "Advanced (3+ yrs)" },
                { value: "ELITE", label: "Elite / Competitive" },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="label block mb-1.5">Primary focus</label>
              <Select
                value={form.primaryFocus}
                onChange={set("primaryFocus")}
                options={[
                  { value: "", label: "—" },
                  { value: "STRENGTH", label: "Strength" },
                  { value: "HYPERTROPHY", label: "Hypertrophy" },
                  { value: "POWERBUILDING", label: "Powerbuilding" },
                  { value: "ATHLETIC", label: "Athletic performance" },
                  { value: "ENDURANCE", label: "Endurance" },
                  { value: "GENERAL", label: "General fitness" },
                ]}
              />
            </div>
            <div>
              <label className="label block mb-1.5">Current phase</label>
              <Select
                value={form.trainingPhase}
                onChange={set("trainingPhase")}
                options={[
                  { value: "", label: "—" },
                  { value: "CUT", label: "Cutting" },
                  { value: "BULK", label: "Bulking" },
                  { value: "MAINTAIN", label: "Maintaining" },
                  { value: "RECOMP", label: "Recomp" },
                  { value: "PEAK", label: "Peaking" },
                  { value: "OFFSEASON", label: "Off-season" },
                ]}
              />
            </div>
          </div>

          <Field
            label="Preferred split"
            value={form.preferredSplit}
            onChange={set("preferredSplit")}
            placeholder="e.g. Push / Pull / Legs"
          />

          <div>
            <label className="label block mb-1.5">
              Injuries / limitations
            </label>
            <textarea
              value={form.injuries}
              onChange={(e) => set("injuries")(e.target.value)}
              placeholder="e.g. Tweaky left shoulder on heavy overhead. Warm up longer for lower back."
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none leading-relaxed"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>

          <div>
            <label className="label block mb-1.5">Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => set("bio")(e.target.value)}
              placeholder="A bit about you…"
              rows={2}
              className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none leading-relaxed"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>

          <PeriodizationEditor
            value={periodization}
            onChange={setPeriodization}
            trainedDates={trainedDates}
          />

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="label">
                Coach AI notes
              </label>
              <span
                className="text-[10px]"
                style={{ color: "var(--accent)" }}
              >
                Feeds the AI prompt
              </span>
            </div>
            <textarea
              value={form.coachPrompt}
              onChange={(e) => set("coachPrompt")(e.target.value)}
              placeholder={`Anything the Coach AI should use when programming for you. Examples:
• Priority body parts: "Chest and shoulders 3× / week, arms 2× / week"
• Tone: "Be blunt, no fluff"
• Equipment: "Only barbell + dumbbells up to 80lb"
• Schedule: "No sessions Tuesdays or Sundays"
• Technique notes: "Left shoulder prefers DB over BB overhead press"`}
              rows={7}
              className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none leading-relaxed"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
            <p
              className="text-[11px] mt-1.5 leading-snug"
              style={{ color: "var(--fg-dim)" }}
            >
              Everything you write here is injected into your Coach AI&apos;s
              prompt on every message, so programming, workout suggestions,
              and advice always respect it.
            </p>
          </div>

          {/* Body measurements — nested, so it only appears once Training
              profile is expanded. */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              onClick={toggleMeasurements}
              className="w-full flex items-center justify-between px-4 py-3.5 text-left"
            >
              <div>
                <p className="label">Body measurements</p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--fg-dim)" }}
                >
                  {filledMeasurements > 0
                    ? `${filledMeasurements} tracked`
                    : `Optional — ${unit === "cm" ? "centimetres" : "inches"}`}
                </p>
              </div>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--fg-muted)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  transform: showMeasurements
                    ? "rotate(180deg)"
                    : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>

            {showMeasurements && (
              <div
                className="p-4 pt-2 space-y-3 animate-slide-up"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <p
                    className="label text-[9px]"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    Baseline
                  </p>
                  <div
                    className="flex gap-0.5 p-0.5 rounded-full"
                    style={{
                      background: "var(--bg-card)",
                      border: "1px solid var(--border)",
                    }}
                    role="group"
                    aria-label="Measurement unit"
                  >
                    {(["in", "cm"] as MeasureUnit[]).map((u) => {
                      const active = u === unit;
                      return (
                        <button
                          key={u}
                          type="button"
                          onClick={() => switchUnit(u)}
                          aria-pressed={active}
                          className="px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider transition-colors"
                          style={{
                            background: active
                              ? "var(--accent-dim)"
                              : "transparent",
                            color: active ? "var(--accent)" : "var(--fg-dim)",
                          }}
                        >
                          {u}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field
                    label="Height"
                    type="number"
                    value={form.height}
                    onChange={set("height")}
                    placeholder={ph(70)}
                    suffix={unit}
                    compact
                  />
                  <Field
                    label="Resting HR"
                    type="number"
                    value={form.restingHR}
                    onChange={set("restingHR")}
                    placeholder="58"
                    suffix="bpm"
                    compact
                  />
                </div>

                <p
                  className="label text-[9px] mt-4"
                  style={{ color: "var(--fg-dim)" }}
                >
                  Upper body ({unit})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Neck"
                    type="number"
                    value={form.neck}
                    onChange={set("neck")}
                    placeholder={ph(15)}
                    compact
                  />
                  <Field
                    label="Shoulders"
                    type="number"
                    value={form.shoulders}
                    onChange={set("shoulders")}
                    placeholder={ph(47)}
                    compact
                  />
                  <Field
                    label="Chest"
                    type="number"
                    value={form.chest}
                    onChange={set("chest")}
                    placeholder={ph(41)}
                    compact
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Arm"
                    type="number"
                    value={form.arm}
                    onChange={set("arm")}
                    placeholder={ph(15)}
                    compact
                  />
                  <Field
                    label="Forearm"
                    type="number"
                    value={form.forearm}
                    onChange={set("forearm")}
                    placeholder={ph(13)}
                    compact
                  />
                  <Field
                    label="Waist"
                    type="number"
                    value={form.waist}
                    onChange={set("waist")}
                    placeholder={ph(32)}
                    compact
                  />
                </div>

                <p
                  className="label text-[9px] mt-4"
                  style={{ color: "var(--fg-dim)" }}
                >
                  Lower body ({unit})
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Hips"
                    type="number"
                    value={form.hips}
                    onChange={set("hips")}
                    placeholder={ph(39)}
                    compact
                  />
                  <Field
                    label="Thigh"
                    type="number"
                    value={form.thigh}
                    onChange={set("thigh")}
                    placeholder={ph(24)}
                    compact
                  />
                  <Field
                    label="Calf"
                    type="number"
                    value={form.calf}
                    onChange={set("calf")}
                    placeholder={ph(16)}
                    compact
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              type="submit"
              disabled={pending}
              className="btn-accent flex-1 py-3 rounded-xl text-[14px]"
            >
              {pending ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
            </button>
          </div>
          </form>
        )}
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  suffix,
  compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  suffix?: string;
  compact?: boolean;
}) {
  return (
    <div>
      <label className="label block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type}
          inputMode={type === "number" ? "decimal" : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-xl px-3 text-[14px] focus:outline-none ${
            compact ? "py-2.5 nums" : "py-3"
          } ${type === "date" ? "profile-date-input" : ""}`}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            paddingRight: suffix ? "2.5rem" : undefined,
            fontFamily: compact ? "var(--font-geist-mono)" : undefined,
            colorScheme: type === "date" ? "dark" : undefined,
            minHeight: 46,
            WebkitAppearance: type === "date" ? "none" : undefined,
            appearance: type === "date" ? "none" : undefined,
          }}
        />
        {suffix && (
          <span
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] label"
            style={{ color: "var(--fg-dim)" }}
          >
            {suffix}
          </span>
        )}
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
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        color: "var(--fg)",
        backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2352525b' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.75rem center",
        paddingRight: "2rem",
        minHeight: 46,
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

function countMeasurements(user: UserProfile): number {
  const keys: (keyof UserProfile)[] = [
    "height",
    "restingHR",
    "waist",
    "hips",
    "chest",
    "shoulders",
    "neck",
    "arm",
    "forearm",
    "thigh",
    "calf",
  ];
  return keys.filter((k) => user[k] != null).length;
}
