"use client";

import { updateProfile as updateProfileAction } from "@/lib/actions/workouts";
import { useState, useTransition } from "react";

type UserProfile = {
  name: string;
  email: string;
  bodyweight: number | null;
  preferredSplit: string | null;
  bio: string | null;
  experienceLevel: string | null;
  primaryFocus: string | null;
  trainingDays: number | null;
  injuries: string | null;
  coachPrompt: string | null;
  height: number | null;
  bodyFat: number | null;
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

export default function ProfileForm({ user }: { user: UserProfile }) {
  const [pending, startTransition] = useTransition();
  const [showMeasurements, setShowMeasurements] = useState(
    hasAnyMeasurement(user)
  );
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState({
    name: user.name,
    bodyweight: user.bodyweight?.toString() ?? "",
    trainingDays: user.trainingDays?.toString() ?? "",
    experienceLevel: user.experienceLevel ?? "",
    primaryFocus: user.primaryFocus ?? "",
    preferredSplit: user.preferredSplit ?? "",
    injuries: user.injuries ?? "",
    bio: user.bio ?? "",
    coachPrompt: user.coachPrompt ?? "",
    height: user.height?.toString() ?? "",
    bodyFat: user.bodyFat?.toString() ?? "",
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);

    const numOrNull = (v: string) =>
      v.trim() === "" ? null : parseFloat(v);
    const intOrNull = (v: string) =>
      v.trim() === "" ? null : parseInt(v);

    startTransition(async () => {
      await updateProfileAction({
        name: form.name,
        bodyweight: form.bodyweight ? parseFloat(form.bodyweight) : undefined,
        trainingDays: form.trainingDays
          ? parseInt(form.trainingDays)
          : undefined,
        experienceLevel: form.experienceLevel,
        primaryFocus: form.primaryFocus,
        preferredSplit: form.preferredSplit,
        injuries: form.injuries,
        bio: form.bio,
        coachPrompt: form.coachPrompt,
        height: numOrNull(form.height),
        bodyFat: numOrNull(form.bodyFat),
        restingHR: intOrNull(form.restingHR),
        waist: numOrNull(form.waist),
        hips: numOrNull(form.hips),
        chest: numOrNull(form.chest),
        shoulders: numOrNull(form.shoulders),
        neck: numOrNull(form.neck),
        arm: numOrNull(form.arm),
        forearm: numOrNull(form.forearm),
        thigh: numOrNull(form.thigh),
        calf: numOrNull(form.calf),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  const filledMeasurements = countMeasurements(user);

  return (
    <>
      {/* Training profile */}
      <div className="card p-5 mb-3">
        <h2 className="font-semibold text-[14px] tracking-tight mb-1">
          Training profile
        </h2>
        <p
          className="text-[11px] mb-4"
          style={{ color: "var(--fg-dim)" }}
        >
          Your coach tunes itself to these answers.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field
            label="Name"
            value={form.name}
            onChange={set("name")}
          />

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
                { value: "RECOMP", label: "Body recomposition" },
                { value: "CUT", label: "Fat loss, preserve muscle" },
                { value: "ATHLETIC", label: "Athletic performance" },
                { value: "GENERAL", label: "General fitness" },
              ]}
            />
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

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label className="label">Coach notes</label>
              <span
                className="text-[10px]"
                style={{ color: "var(--fg-dim)" }}
              >
                Optional extras
              </span>
            </div>
            <textarea
              value={form.coachPrompt}
              onChange={(e) => set("coachPrompt")(e.target.value)}
              placeholder="Anything else the coach should know — tone preferences, equipment limits, schedule constraints."
              rows={3}
              className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none leading-relaxed"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>

          {/* Body measurements (collapsible) */}
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              onClick={() => setShowMeasurements(!showMeasurements)}
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
                    : "Optional — cm units"}
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
                <p
                  className="label text-[9px]"
                  style={{ color: "var(--fg-dim)" }}
                >
                  Body composition
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Height"
                    type="number"
                    value={form.height}
                    onChange={set("height")}
                    placeholder="178"
                    suffix="cm"
                    compact
                  />
                  <Field
                    label="Body fat"
                    type="number"
                    value={form.bodyFat}
                    onChange={set("bodyFat")}
                    placeholder="14"
                    suffix="%"
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
                  Upper body (cm)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Neck"
                    type="number"
                    value={form.neck}
                    onChange={set("neck")}
                    placeholder="38"
                    compact
                  />
                  <Field
                    label="Shoulders"
                    type="number"
                    value={form.shoulders}
                    onChange={set("shoulders")}
                    placeholder="120"
                    compact
                  />
                  <Field
                    label="Chest"
                    type="number"
                    value={form.chest}
                    onChange={set("chest")}
                    placeholder="104"
                    compact
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Arm"
                    type="number"
                    value={form.arm}
                    onChange={set("arm")}
                    placeholder="38"
                    compact
                  />
                  <Field
                    label="Forearm"
                    type="number"
                    value={form.forearm}
                    onChange={set("forearm")}
                    placeholder="32"
                    compact
                  />
                  <Field
                    label="Waist"
                    type="number"
                    value={form.waist}
                    onChange={set("waist")}
                    placeholder="82"
                    compact
                  />
                </div>

                <p
                  className="label text-[9px] mt-4"
                  style={{ color: "var(--fg-dim)" }}
                >
                  Lower body (cm)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <Field
                    label="Hips"
                    type="number"
                    value={form.hips}
                    onChange={set("hips")}
                    placeholder="98"
                    compact
                  />
                  <Field
                    label="Thigh"
                    type="number"
                    value={form.thigh}
                    onChange={set("thigh")}
                    placeholder="62"
                    compact
                  />
                  <Field
                    label="Calf"
                    type="number"
                    value={form.calf}
                    onChange={set("calf")}
                    placeholder="40"
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
          }`}
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            paddingRight: suffix ? "2.5rem" : undefined,
            fontFamily: compact ? "var(--font-geist-mono)" : undefined,
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

function hasAnyMeasurement(user: UserProfile): boolean {
  return countMeasurements(user) > 0;
}

function countMeasurements(user: UserProfile): number {
  const keys: (keyof UserProfile)[] = [
    "height",
    "bodyFat",
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
