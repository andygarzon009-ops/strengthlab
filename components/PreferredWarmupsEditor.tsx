"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  WARMUP_SPLIT_KEYS,
  type WarmupSplitKey,
  type WarmupItem,
  type PreferredWarmups,
} from "@/lib/warmupPreferences";
import { savePreferredWarmupsForSplit } from "@/lib/actions/warmupPreferences";

const SPLIT_LABEL: Record<WarmupSplitKey, string> = {
  PUSH: "Push",
  PULL: "Pull",
  LEGS: "Legs",
  UPPER: "Upper",
  LOWER: "Lower",
  ARMS: "Arms",
  FULL_BODY: "Full Body",
  CORE: "Core",
};

const KIND_OPTIONS: { value: WarmupItem["kind"]; label: string }[] = [
  { value: "cardio", label: "Cardio" },
  { value: "mobility", label: "Mobility" },
  { value: "activation", label: "Activation" },
];

type DraftItem = {
  kind: WarmupItem["kind"] | "";
  name: string;
  // Stored as a string so the user can clear the field without it snapping
  // back to 0. Converted to a number on save.
  durationMin: string;
  reps: string;
  instructions: string;
};

function toDraft(it: WarmupItem): DraftItem {
  return {
    kind: it.kind ?? "",
    name: it.name,
    durationMin: it.durationSec ? String(Math.round(it.durationSec / 60)) : "",
    reps: it.reps ? String(it.reps) : "",
    instructions: it.instructions ?? "",
  };
}

function fromDraft(d: DraftItem): WarmupItem | null {
  const name = d.name.trim();
  if (!name) return null;
  const durationSec = d.durationMin.trim()
    ? Math.round(parseFloat(d.durationMin) * 60)
    : undefined;
  const reps = d.reps.trim() ? parseInt(d.reps, 10) : undefined;
  if (!durationSec && !reps) return null;
  return {
    kind: d.kind === "" ? undefined : d.kind,
    name,
    durationSec: Number.isFinite(durationSec) ? durationSec : undefined,
    reps: Number.isFinite(reps) ? reps : undefined,
    instructions: d.instructions.trim() || undefined,
  };
}

const EMPTY_DRAFT: DraftItem = {
  kind: "",
  name: "",
  durationMin: "",
  reps: "",
  instructions: "",
};

export default function PreferredWarmupsEditor({
  initial,
}: {
  initial: PreferredWarmups;
}) {
  const router = useRouter();
  const [split, setSplit] = useState<WarmupSplitKey>("PUSH");
  const [bySplit, setBySplit] = useState<Record<WarmupSplitKey, DraftItem[]>>(
    () => {
      const out = {} as Record<WarmupSplitKey, DraftItem[]>;
      for (const k of WARMUP_SPLIT_KEYS) {
        out[k] = (initial[k] ?? []).map(toDraft);
      }
      return out;
    },
  );
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptText, setPromptText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);

  const drafts = bySplit[split];

  const generateFromPrompt = async () => {
    const text = promptText.trim();
    if (!text) return;
    setGenerating(true);
    setPromptError(null);
    try {
      const res = await fetch("/api/warmup-from-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, split }),
      });
      const body = await res.json();
      if (!res.ok) {
        setPromptError(body.error ?? "Couldn't generate");
        return;
      }
      const items = (body.items as WarmupItem[]).map(toDraft);
      setBySplit((prev) => ({ ...prev, [split]: items }));
      setShowPrompt(false);
      setPromptText("");
    } catch (e) {
      setPromptError(e instanceof Error ? e.message : "Network error");
    } finally {
      setGenerating(false);
    }
  };

  const update = (idx: number, patch: Partial<DraftItem>) => {
    setBySplit((prev) => ({
      ...prev,
      [split]: prev[split].map((d, i) => (i === idx ? { ...d, ...patch } : d)),
    }));
  };

  const remove = (idx: number) => {
    setBySplit((prev) => ({
      ...prev,
      [split]: prev[split].filter((_, i) => i !== idx),
    }));
  };

  const add = () => {
    setBySplit((prev) => ({
      ...prev,
      [split]: [...prev[split], { ...EMPTY_DRAFT }],
    }));
  };

  const save = () => {
    const items = drafts
      .map(fromDraft)
      .filter((x): x is WarmupItem => x !== null);
    setStatus("Saving…");
    startTransition(async () => {
      await savePreferredWarmupsForSplit(split, items);
      setStatus("Saved");
      router.refresh();
      setTimeout(() => setStatus(null), 1500);
    });
  };

  const countFor = (k: WarmupSplitKey) =>
    bySplit[k].filter((d) => fromDraft(d) !== null).length;

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-1 px-1">
        {WARMUP_SPLIT_KEYS.map((k) => {
          const active = k === split;
          const n = countFor(k);
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSplit(k)}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap"
              style={{
                background: active ? "var(--accent-dim)" : "var(--bg-card)",
                color: active ? "var(--accent)" : "var(--fg-muted)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              {SPLIT_LABEL[k]}
              {n > 0 ? ` · ${n}` : ""}
            </button>
          );
        })}
      </div>

      <div className="mb-4">
        {showPrompt ? (
          <div className="card p-3 space-y-2">
            <p
              className="text-[11px]"
              style={{ color: "var(--fg-dim)" }}
            >
              Describe your {SPLIT_LABEL[split]} warm-up — AI will structure it.
              This replaces the current list for this split.
            </p>
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder="e.g. 5 min easy bike, hip openers, 10 banded glute bridges, leg swings"
              rows={3}
              className="w-full px-3 py-2 rounded-lg text-[13px] resize-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
            {promptError && (
              <p className="text-[12px]" style={{ color: "#f87171" }}>
                {promptError}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={generateFromPrompt}
                disabled={generating || !promptText.trim()}
                className="btn-accent px-3 py-1.5 rounded-lg text-[12px]"
              >
                {generating ? "Generating…" : "Generate"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPrompt(false);
                  setPromptError(null);
                }}
                className="px-3 py-1.5 rounded-lg text-[12px]"
                style={{
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowPrompt(true)}
            className="w-full py-2.5 rounded-lg text-[13px] font-medium flex items-center justify-center gap-2"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid var(--accent)",
              color: "var(--accent)",
            }}
          >
            ✨ Describe it in your own words
          </button>
        )}
      </div>

      <div className="space-y-3">
        {drafts.length === 0 ? (
          <p
            className="text-[13px] py-6 text-center"
            style={{ color: "var(--fg-dim)" }}
          >
            No preferred warm-ups for {SPLIT_LABEL[split]} yet. Add one below
            and your AI coach will use it on matching sessions.
          </p>
        ) : (
          drafts.map((d, i) => (
            <div key={i} className="card p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={d.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  placeholder="e.g. Easy bike"
                  className="flex-1 px-3 py-2 rounded-lg text-[14px]"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                  }}
                />
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label="Remove warm-up item"
                  className="px-3 rounded-lg text-[12px]"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--fg-dim)",
                  }}
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={d.kind ?? ""}
                  onChange={(e) =>
                    update(i, {
                      kind: (e.target.value || "") as DraftItem["kind"],
                    })
                  }
                  className="px-2 py-2 rounded-lg text-[13px]"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                  }}
                >
                  <option value="">Kind…</option>
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={d.durationMin}
                  onChange={(e) => update(i, { durationMin: e.target.value })}
                  placeholder="Min"
                  className="px-2 py-2 rounded-lg text-[13px]"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                  }}
                />
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={d.reps}
                  onChange={(e) => update(i, { reps: e.target.value })}
                  placeholder="Reps"
                  className="px-2 py-2 rounded-lg text-[13px]"
                  style={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border)",
                    color: "var(--fg)",
                  }}
                />
              </div>
              <input
                type="text"
                value={d.instructions}
                onChange={(e) => update(i, { instructions: e.target.value })}
                placeholder="Notes (optional)"
                className="w-full px-3 py-2 rounded-lg text-[13px]"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                  color: "var(--fg)",
                }}
              />
            </div>
          ))
        )}

        <button
          type="button"
          onClick={add}
          disabled={drafts.length >= 12}
          className="w-full py-2.5 rounded-lg text-[13px] font-medium"
          style={{
            background: "var(--bg-card)",
            border: "1px dashed var(--border)",
            color: "var(--fg-muted)",
          }}
        >
          + Add warm-up item
        </button>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="btn-accent px-4 py-2 rounded-xl text-[13px]"
        >
          {pending ? "Saving…" : `Save ${SPLIT_LABEL[split]} warm-up`}
        </button>
        {status && (
          <span className="text-[12px]" style={{ color: "var(--fg-dim)" }}>
            {status}
          </span>
        )}
      </div>

      <p
        className="text-[11px] mt-4 leading-relaxed"
        style={{ color: "var(--fg-dim)" }}
      >
        Each item needs either a duration (minutes) or a rep count. Items
        without both will be skipped on save.
      </p>
    </div>
  );
}
