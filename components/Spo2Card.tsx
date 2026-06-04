"use client";

import { useEffect, useState } from "react";

type Spo2Response = {
  connected: boolean;
  lastNight: { date: string; avgPct: number; minPct: number } | null;
  baselineAvg?: number | null;
  flag?: "low" | "belowBaseline" | null;
};

const FLAG_META: Record<string, { color: string; text: string }> = {
  low: {
    color: "#ef4444",
    text: "Lower than usual overnight — if you feel run down, prioritize rest. Persistent dips are worth a chat with your doctor.",
  },
  belowBaseline: {
    color: "#f97316",
    text: "A little below your normal. Often nothing, but can show up a day or two before you feel a cold coming on.",
  },
};

/// Last night's blood-oxygen (SpO2) on the recovery page. Fetches live from
/// Google Health (the recovery snapshot doesn't persist SpO2). Renders nothing
/// until there's at least one night of data, so it stays invisible for users
/// who don't wear a tracker that reports SpO2.
export default function Spo2Card() {
  const [data, setData] = useState<Spo2Response | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/health/spo2")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Spo2Response | null) => {
        if (active) setData(d);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const last = data?.lastNight;
  if (!last) return null; // no data / not connected → render nothing

  const baseline = data?.baselineAvg ?? null;
  const flag = data?.flag ?? null;
  const flagMeta = flag ? FLAG_META[flag] : null;
  const valueColor = flag === "low" ? "#ef4444" : "var(--fg)";

  return (
    <div className="mb-5">
      <p className="label mb-2">Blood oxygen</p>
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-baseline justify-between">
          <p
            className="text-[22px] font-bold tabular-nums"
            style={{ color: valueColor }}
          >
            {last.avgPct}%
            <span
              className="text-[12px] ml-2 font-normal"
              style={{ color: "var(--fg-dim)" }}
            >
              avg overnight
            </span>
          </p>
          <p
            className="text-[12px] tabular-nums"
            style={{ color: "var(--fg-dim)" }}
          >
            low {last.minPct}%
          </p>
        </div>

        <p className="text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
          {baseline != null
            ? `Your baseline is ${baseline}%.`
            : "Building your baseline over the next few nights."}
        </p>

        {flagMeta && (
          <p
            className="text-[11px] mt-2 leading-snug"
            style={{ color: flagMeta.color }}
          >
            {flagMeta.text}
          </p>
        )}
      </div>
    </div>
  );
}
