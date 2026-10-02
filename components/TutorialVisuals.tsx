// Mini, static previews of real screens for the app tour — example data,
// the app's own colours and type — so each slide shows the feature instead of
// describing it. Nothing here is interactive.

import MuscleMap, { type MuscleLoad } from "@/components/MuscleMap";
import Sparkline from "@/components/Sparkline";
import { HEAT_GRADIENT, summarize } from "@/lib/bodyScan";

const LIME = "#a3e635";
const BLUE = "#60a5fa";
const MONO = { fontFamily: "var(--font-geist-mono)" } as const;

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-[320px] rounded-2xl p-4 text-left"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        boxShadow: "0 18px 40px -18px rgba(34,197,94,0.35)",
      }}
      aria-hidden
    >
      {children}
    </div>
  );
}

function Ring({ value, size = 56 }: { value: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elevated)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#22c55e"
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[15px] font-semibold" style={MONO}>
        {value}
      </span>
    </div>
  );
}

function Pill({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "green" }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold"
      style={
        tone === "green"
          ? { background: "var(--accent)", color: "#052e16" }
          : { background: "var(--bg-elevated)", color: "var(--fg-muted)" }
      }
    >
      {children}
    </span>
  );
}

export function VisualFeed() {
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <Ring value={78} />
        <div>
          <p className="label text-[9px]" style={{ color: "var(--fg-dim)" }}>Today · Wed</p>
          <p className="text-[18px] font-extrabold leading-none mt-1">Pull day</p>
          <p className="text-[11px] mt-1" style={{ ...MONO, color: "var(--fg-muted)" }}>5 lifts · ~55 min</p>
        </div>
      </div>
      <p className="text-[12px] mt-3 leading-snug" style={{ color: "var(--fg-muted)" }}>
        HRV up and 7h 40m of sleep — a good day to push.
      </p>
      <div className="mt-3 rounded-xl py-2 text-center text-[13px] font-bold" style={{ background: "var(--accent)", color: "#052e16" }}>
        Start Pull day →
      </div>
      <div className="flex gap-[3px] mt-4">
        {[1, 1, 1, 1, 0, 1, 2, 3, 3, 9, 3, 0, 3, 3, 3, 3].map((k, i) =>
          k === 0 ? (
            <span key={i} className="w-1.5" />
          ) : k === 9 ? (
            <span key={i} className="w-1.5 h-1.5 rounded-full self-center" style={{ background: BLUE }} />
          ) : (
            <span
              key={i}
              className="flex-1 rounded-full"
              style={{
                height: k === 2 ? 8 : 5,
                background: k === 3 ? "var(--bg-elevated)" : "var(--accent)",
                opacity: k === 1 ? 0.35 : 1,
              }}
            />
          ),
        )}
      </div>
      <p className="text-[10px] mt-1.5" style={{ color: "var(--fg-dim)" }}>Hypertrophy · week 2 of 4 · deload in 2 weeks</p>
    </Frame>
  );
}

export function VisualStart() {
  return (
    <Frame>
      <div className="rounded-xl px-3 py-2 text-[12px] flex justify-between" style={{ background: "var(--bg-elevated)" }}>
        <span>Weight training</span>
        <span style={{ color: "var(--fg-dim)" }}>▾</span>
      </div>
      <div
        className="mt-2.5 rounded-xl py-2.5 text-center text-[13px] font-bold"
        style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid rgba(34,197,94,0.35)" }}
      >
        ▶ Begin workout
      </div>
      <div className="mt-2.5 flex gap-2">
        <div className="flex-1 rounded-xl py-2.5 text-center text-[12px]" style={{ border: "1px dashed var(--border-strong, var(--border))", color: "var(--fg-muted)" }}>
          + Add Exercise
        </div>
        <div className="w-11 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-dim)", color: "var(--accent)", border: "1px solid rgba(34,197,94,0.35)" }}>
          🎙
        </div>
      </div>
      <div className="mt-2.5 rounded-xl py-2 text-center text-[11px]" style={{ border: "1px dashed var(--border)", color: "var(--fg-dim)" }}>
        + Invite a training partner
      </div>
    </Frame>
  );
}

function SetRow({ n, w, r, rir, done, drop }: { n: string; w: string; r: string; rir?: string; done?: boolean; drop?: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1" style={drop ? { paddingLeft: 14 } : undefined}>
      <span className="w-4 text-[11px]" style={{ ...MONO, color: drop ? "var(--fg-dim)" : "var(--accent)" }}>{n}</span>
      <span className="px-2 py-1 rounded-md text-[12px]" style={{ ...MONO, background: "var(--bg-elevated)" }}>{w}</span>
      <span className="text-[11px]" style={{ color: "var(--fg-dim)" }}>×</span>
      <span className="px-2 py-1 rounded-md text-[12px]" style={{ ...MONO, background: "var(--bg-elevated)" }}>{r}</span>
      {rir && (
        <span className="px-1.5 py-1 rounded-md text-[10px]" style={{ ...MONO, background: "var(--bg-elevated)", color: "var(--fg-muted)" }}>
          RIR {rir}
        </span>
      )}
      <span className="ml-auto w-6 h-6 rounded-md flex items-center justify-center text-[12px]" style={done ? { background: "var(--accent)", color: "#052e16" } : { background: "var(--bg-elevated)", color: "var(--fg-dim)" }}>
        ✓
      </span>
    </div>
  );
}

export function VisualSets() {
  return (
    <Frame>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[14px] font-bold">Bench Press</p>
        <Pill tone="green">⏱ 2:00</Pill>
      </div>
      <SetRow n="1" w="225" r="5" rir="2" done />
      <SetRow n="2" w="225" r="5" rir="1" done />
      <SetRow n="↘" w="185" r="8" rir="0" drop />
      <div className="flex items-center justify-between mt-3 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="text-[12px]">Deload week</span>
        <span className="w-9 h-5 rounded-full relative" style={{ background: "var(--bg-elevated)" }}>
          <span className="absolute left-0.5 top-0.5 w-4 h-4 rounded-full" style={{ background: "#fff" }} />
        </span>
      </div>
    </Frame>
  );
}

export function VisualFinish() {
  return (
    <Frame>
      <div className="flex items-center gap-2">
        <p className="text-[15px] font-bold">Push day</p>
        <span className="label text-[9px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: "rgba(163,230,53,0.14)", color: LIME }}>PR</span>
      </div>
      <div className="flex items-center gap-3 mt-2.5">
        <div className="flex-1">
          <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>Bench Press · top set</p>
          <p className="mt-1 leading-none">
            <span className="text-[20px] font-semibold" style={{ ...MONO, color: LIME }}>235 × 5</span>
            <span className="text-[11px] font-semibold ml-2" style={{ ...MONO, color: LIME }}>↑ 10 lb</span>
          </p>
        </div>
        <Sparkline values={[205, 210, 210, 215, 225, 225, 235]} color={LIME} dot />
      </div>
      <p className="text-[11px] mt-3" style={{ ...MONO, color: "var(--fg-dim)" }}>
        6 lifts · 18 sets · 52 min · <span style={{ color: "#ef4444" }}>♥</span> 118/162 bpm
      </p>
    </Frame>
  );
}

export function VisualCoach() {
  const bubble = (text: string, me?: boolean) => (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <p
        className="max-w-[80%] px-3 py-2 rounded-2xl text-[12px] leading-snug"
        style={me ? { background: "var(--accent)", color: "#052e16" } : { background: "var(--bg-elevated)" }}
      >
        {text}
      </p>
    </div>
  );
  return (
    <Frame>
      <div className="space-y-2">
        {bubble("what should I train today?", true)}
        <div className="flex justify-start">
          <div className="max-w-[85%] px-3 py-2 rounded-2xl text-[12px] leading-snug" style={{ background: "var(--bg-elevated)" }}>
            Pull day — rows, pull-ups, curls. Push the top set on rows.
            <div className="mt-2 rounded-lg py-1.5 text-center text-[11px] font-bold" style={{ background: "var(--accent)", color: "#052e16" }}>
              Do this workout
            </div>
          </div>
        </div>
        {bubble("rows 185 for 8", true)}
        <div className="flex justify-end">
          <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: "var(--accent-dim)", color: "var(--accent)" }}>
            ✓ Logged Barbell Row 185 × 8
          </span>
        </div>
      </div>
    </Frame>
  );
}

export function VisualCycle() {
  const row = (name: string, weeks: number, lit?: boolean) => (
    <div className="flex items-center gap-2">
      <div className="flex-1 rounded-lg px-2.5 py-1.5 text-[12px] flex justify-between" style={{ background: "var(--bg-elevated)" }}>
        <span>{name}</span>
        <span style={{ color: "var(--fg-dim)" }}>▾</span>
      </div>
      <span
        className="w-7 h-7 rounded-lg flex items-center justify-center text-[13px]"
        style={{
          background: lit ? "rgba(250,204,21,0.16)" : "rgba(250,204,21,0.08)",
          border: `1px solid ${lit ? "rgba(250,204,21,0.55)" : "rgba(250,204,21,0.3)"}`,
          filter: lit ? "drop-shadow(0 0 5px rgba(250,204,21,0.6))" : undefined,
        }}
      >
        💡
      </span>
      <span className="text-[11px] w-9 text-right" style={{ ...MONO, color: "var(--fg-muted)" }}>{weeks} wk</span>
    </div>
  );
  return (
    <Frame>
      <div className="space-y-1.5">
        {row("Power-building", 4)}
        {row("Hypertrophy", 4, true)}
      </div>
      <div className="mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-snug" style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--fg)" }}>Hypertrophy</span> — every set 6–12 reps, 1–2 in reserve, 10–20 sets per muscle a week.
      </div>
      <div className="space-y-1.5 mt-1.5">{row("Pure strength", 4)}</div>
    </Frame>
  );
}

function sampleLoad(): MuscleLoad {
  const s = (m: string, hoursAgo: number, sets: number) => summarize(m, [{ hoursAgo, sets }]);
  return {
    "Pec Major": s("Pec Major", 20, 14),
    "Front Delts": s("Front Delts", 20, 8),
    "Side Delts": s("Side Delts", 20, 6),
    Triceps: s("Triceps", 20, 8),
    Lats: s("Lats", 50, 10),
    Rhomboids: s("Rhomboids", 50, 7),
    Biceps: s("Biceps", 50, 6),
    Quads: summarize("Quads", [{ hoursAgo: 30, sets: 12 }, { hoursAgo: 6, sets: 12 }]),
    Glutes: s("Glutes", 6, 8),
    Hamstrings: s("Hamstrings", 110, 8),
    Abs: s("Abs", 6, 6),
    Traps: s("Traps", 90, 4),
  };
}

export function VisualBody() {
  return (
    <Frame>
      <div className="flex justify-center">
        <MuscleMap load={sampleLoad()} width={70} />
      </div>
      <span className="block h-1.5 rounded-full mt-3" style={{ background: HEAT_GRADIENT }} />
      <div className="flex justify-between text-[9px] mt-1" style={{ ...MONO, color: "var(--fg-dim)" }}>
        <span>Cold</span>
        <span>Stale</span>
        <span>Fresh</span>
        <span>Peak</span>
        <span>Over</span>
      </div>
      <p className="text-[11px] mt-2.5" style={{ color: "#f87171" }}>
        <span className="font-semibold">Overworked:</span> Quads hit again before recovering
      </p>
      <p className="text-[11px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
        <span className="font-semibold">Ready in:</span> Pec Major 52h · Lats 10h
      </p>
    </Frame>
  );
}

export function VisualLog() {
  // 0 rest, 1 trained, 2 deload, 3 today
  const days = [0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 0, 0, 2, 2, 0, 2, 0, 0, 3];
  return (
    <Frame>
      <p className="text-[13px] font-bold mb-2">October</p>
      <div className="grid grid-cols-7 gap-1.5">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="text-center text-[9px]" style={{ ...MONO, color: "var(--fg-dim)" }}>{d}</span>
        ))}
        {days.map((k, i) => (
          <span
            key={i}
            className="aspect-square rounded-md flex items-center justify-center text-[10px]"
            style={{
              ...MONO,
              background: k === 1 ? "var(--accent)" : k === 2 ? BLUE : "transparent",
              color: k === 1 || k === 2 ? "#0a0a0a" : "var(--fg-dim)",
              border: k === 3 ? "1px solid var(--border)" : undefined,
              fontWeight: k ? 600 : 400,
            }}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <p className="text-[10px] mt-2" style={{ color: "var(--fg-dim)" }}>
        <span style={{ color: "var(--accent)" }}>■</span> trained · <span style={{ color: BLUE }}>■</span> deload
      </p>
    </Frame>
  );
}

export function VisualCrew() {
  const people: [string, string, boolean][] = [
    ["MA", "#7c3aed", true],
    ["SA", "#b45309", true],
    ["JO", "#0e7490", false],
    ["RI", "#be185d", false],
  ];
  return (
    <Frame>
      <div className="flex items-center gap-3">
        <div className="flex gap-2">
          {people.map(([i, c, on]) => (
            <span
              key={i}
              className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: c, boxShadow: on ? "0 0 0 2px var(--bg-card), 0 0 0 4px var(--accent)" : "0 0 0 2px var(--bg-card), 0 0 0 3px var(--border)" }}
            >
              {i}
            </span>
          ))}
        </div>
      </div>
      <p className="text-[11px] mt-2.5" style={{ color: "var(--fg-muted)" }}>
        <span className="font-semibold" style={{ color: "var(--fg)" }}>Maya and Sam</span> trained today
      </p>
      <div className="mt-3 rounded-xl p-3" style={{ background: "var(--bg-elevated)" }}>
        <p className="text-[12px] font-semibold">Maya · Leg day</p>
        <p className="text-[11px] mt-0.5" style={{ ...MONO, color: "var(--fg-muted)" }}>Squat 275 × 5 <span style={{ color: "var(--accent)" }}>↑ 10 lb</span></p>
        <div className="flex gap-1.5 mt-2">
          <Pill>🔥 Fire</Pill>
          <Pill>🏆 PR</Pill>
          <Pill>👍 Like</Pill>
        </div>
      </div>
    </Frame>
  );
}

export function VisualHealth() {
  const tile = (label: string, value: string, sub: string) => (
    <div className="flex-1 text-center">
      <p className="text-[16px] font-semibold" style={MONO}>{value}</p>
      <p className="text-[10px] font-semibold mt-0.5">{label}</p>
      <p className="text-[9px]" style={{ color: "var(--fg-dim)" }}>{sub}</p>
    </div>
  );
  return (
    <Frame>
      <div className="flex items-center justify-between rounded-xl px-3 py-2" style={{ background: "var(--bg-elevated)" }}>
        <span className="text-[12px] font-semibold">Google Health</span>
        <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>✓ Connected</span>
      </div>
      <div className="flex mt-3">
        {tile("Recovery", "78", "Good")}
        {tile("Sleep", "7h 40", "last night")}
        {tile("Resting", "54", "bpm ↓2")}
      </div>
      <div className="mt-3 rounded-xl px-3 py-2 flex justify-between text-[11px]" style={{ background: "var(--bg-elevated)" }}>
        <span style={{ color: "var(--fg-muted)" }}>Nutrition goal</span>
        <span className="font-semibold">Lean bulk ▾</span>
      </div>
    </Frame>
  );
}
