"use client";

// Fuel settings: dietary restrictions and how the athlete cooks. Everything
// here shapes the recipes on Fuel (and the coach's food suggestions).

import { useState, useTransition } from "react";
import { saveFuelSettings } from "@/lib/actions/fuelSettings";
import { DIET_OPTIONS } from "@/lib/diet";
import {
  BUDGET,
  COOK_MINUTES,
  CUISINES,
  EQUIPMENT,
  PROTEINS,
  SKILLS,
  SPICE,
  type MealPrefs,
} from "@/lib/mealPrefs";

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className="text-[12px] font-semibold px-3 py-1.5 rounded-full"
      style={{
        background: on ? "var(--accent-dim)" : "var(--bg-elevated)",
        border: `1px solid ${on ? "rgba(34,197,94,0.45)" : "var(--border)"}`,
        color: on ? "var(--accent)" : "var(--fg-muted)",
      }}
    >
      {on ? "✓ " : ""}
      {children}
    </button>
  );
}

/// One-of-several picker; tapping the chosen option again clears it.
function Segmented<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { key: T; label: string }[];
  onChange: (v: T | null) => void;
}) {
  return (
    <div className="flex rounded-xl p-[3px]" style={{ background: "var(--bg-elevated)" }}>
      {options.map((o) => {
        const on = value === o.key;
        return (
          <button
            key={String(o.key)}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? null : o.key)}
            className="flex-1 py-2 rounded-[9px] text-[12.5px] font-semibold"
            style={{
              background: on ? "var(--bg-card)" : "transparent",
              color: on ? "var(--fg)" : "var(--fg-muted)",
              boxShadow: on ? "inset 0 0 0 1px var(--border-strong)" : undefined,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="card p-5 mb-3">
      <h2 className="font-semibold text-[14px] tracking-tight">{title}</h2>
      {hint && (
        <p className="text-[11.5px] mt-0.5 leading-snug" style={{ color: "var(--fg-dim)" }}>
          {hint}
        </p>
      )}
      <div className="mt-3 space-y-3">{children}</div>
    </div>
  );
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

export default function FuelSettingsForm({
  initial,
}: {
  initial: { dietRestrictions: string[]; dietNotes: string; mealPrefs: MealPrefs };
}) {
  const [diet, setDiet] = useState(initial.dietRestrictions);
  const [notes, setNotes] = useState(initial.dietNotes);
  const [p, setP] = useState(initial.mealPrefs);
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  const set = <K extends keyof MealPrefs>(k: K, v: MealPrefs[K]) => {
    setSaved(false);
    setP((s) => ({ ...s, [k]: v }));
  };

  const save = () =>
    start(async () => {
      await saveFuelSettings({ dietRestrictions: diet, dietNotes: notes, mealPrefs: p });
      // Recipes on Fuel are cached for the session; drop them so the next
      // batch follows the new settings.
      try {
        for (const k of Object.keys(sessionStorage)) if (k.startsWith("nextmeal:")) sessionStorage.removeItem(k);
      } catch {}
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });

  return (
    <>
      <Section title="Dietary restrictions" hint="Strict: no recipe will break these.">
        <div className="flex flex-wrap gap-1.5">
          {DIET_OPTIONS.map((o) => (
            <Chip
              key={o.key}
              on={diet.includes(o.key)}
              onClick={() => {
                setSaved(false);
                setDiet((d) => toggle(d, o.key));
              }}
            >
              {o.label}
            </Chip>
          ))}
        </div>
        <textarea
          value={notes}
          onChange={(e) => {
            setSaved(false);
            setNotes(e.target.value);
          }}
          placeholder="Anything else you avoid or don't like, e.g. no mushrooms, not a fan of salmon"
          rows={2}
          maxLength={300}
          className="w-full rounded-xl px-4 py-3 text-[13px] focus:outline-none resize-none leading-relaxed"
          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--fg)" }}
        />
      </Section>

      <Section title="Cooking">
        <div>
          <p className="label mb-1.5">Time per meal</p>
          <Segmented
            value={p.cookMinutes}
            options={COOK_MINUTES.map((m) => ({ key: m, label: m === 60 ? "60+ min" : `${m} min` }))}
            onChange={(v) => set("cookMinutes", v)}
          />
        </div>
        <div>
          <p className="label mb-1.5">Skill</p>
          <Segmented value={p.skill} options={[...SKILLS]} onChange={(v) => set("skill", v)} />
        </div>
        <div>
          <p className="label mb-1.5">What you cook with</p>
          <div className="flex flex-wrap gap-1.5">
            {EQUIPMENT.map((e) => (
              <Chip key={e} on={p.equipment.includes(e)} onClick={() => set("equipment", toggle(p.equipment, e))}>
                {e}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] mt-1.5" style={{ color: "var(--fg-dim)" }}>
            Leave empty if you have a normal kitchen.
          </p>
        </div>
      </Section>

      <Section title="Meal prep" hint="Cook once, eat for days: recipes that keep and reheat well, sized for the batch.">
        <button
          type="button"
          role="switch"
          aria-checked={p.mealPrep}
          onClick={() => set("mealPrep", !p.mealPrep)}
          className="w-full flex items-center justify-between"
        >
          <span className="text-[13.5px] font-medium">I meal prep</span>
          <span
            className="w-11 h-6 rounded-full relative transition-colors"
            style={{ background: p.mealPrep ? "var(--accent)" : "var(--bg-elevated)", border: "1px solid var(--border)" }}
          >
            <span
              className="absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white transition-all"
              style={{ left: p.mealPrep ? 22 : 2 }}
            />
          </span>
        </button>
        {p.mealPrep && (
          <div className="flex items-center justify-between">
            <span className="text-[13px]" style={{ color: "var(--fg-muted)" }}>
              Servings per batch
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Fewer servings"
                disabled={p.batchServings <= 2}
                onClick={() => set("batchServings", p.batchServings - 1)}
                className="w-9 h-9 rounded-lg text-[18px] font-semibold disabled:opacity-30"
                style={{ background: "var(--bg-elevated)" }}
              >
                −
              </button>
              <span className="w-8 text-center text-[16px] font-bold tabular-nums">{p.batchServings}</span>
              <button
                type="button"
                aria-label="More servings"
                disabled={p.batchServings >= 8}
                onClick={() => set("batchServings", p.batchServings + 1)}
                className="w-9 h-9 rounded-lg text-[18px] font-semibold disabled:opacity-30"
                style={{ background: "var(--bg-elevated)" }}
              >
                +
              </button>
            </div>
          </div>
        )}
      </Section>

      <Section title="What you like" hint="Recipes lean toward these.">
        <div>
          <p className="label mb-1.5">Cuisines</p>
          <div className="flex flex-wrap gap-1.5">
            {CUISINES.map((c) => (
              <Chip key={c} on={p.cuisines.includes(c)} onClick={() => set("cuisines", toggle(p.cuisines, c))}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-1.5">Proteins</p>
          <div className="flex flex-wrap gap-1.5">
            {PROTEINS.map((c) => (
              <Chip key={c} on={p.proteins.includes(c)} onClick={() => set("proteins", toggle(p.proteins, c))}>
                {c}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-1.5">Spice</p>
          <Segmented value={p.spice} options={[...SPICE]} onChange={(v) => set("spice", v)} />
        </div>
      </Section>

      <Section title="Budget">
        <Segmented value={p.budget} options={[...BUDGET]} onChange={(v) => set("budget", v)} />
      </Section>

      <button
        type="button"
        onClick={save}
        disabled={pending}
        className="btn-accent w-full py-3 rounded-xl text-[14px] mt-2"
      >
        {pending ? "Saving…" : saved ? "Saved ✓" : "Save"}
      </button>
    </>
  );
}
