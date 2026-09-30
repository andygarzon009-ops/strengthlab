import Sparkline from "@/components/Sparkline";
import type { SessionProgress } from "@/lib/sessionProgress";

const PR_LIME = "#a3e635";
const DELOAD_BLUE = "#60a5fa";

// Plain module (no "use client") so both the client feed card and the
// server-rendered Log page can use it.
/// The headline lift, how it moved since last time, and its trend.
export default function ProgressRow({ progress }: { progress: SessionProgress }) {
  // A deload's drop is planned, so it reads in deload blue rather than as a
  // grey regression; a PR in lime; a gain in green.
  const color = progress.isDeload
    ? DELOAD_BLUE
    : progress.isPR
      ? PR_LIME
      : progress.direction === "up"
        ? "var(--accent)"
        : "var(--fg-muted)";
  const line = progress.isDeload
    ? DELOAD_BLUE
    : progress.isPR
      ? PR_LIME
      : progress.direction === "up"
        ? "#22c55e"
        : "#a1a1aa";
  return (
    <div className="flex items-center gap-3 mt-3">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] truncate" style={{ color: "var(--fg-dim)" }}>
          {progress.lift} · top set
          {progress.isDeload && (
            <span style={{ color: DELOAD_BLUE }}> · deload</span>
          )}
        </p>
        <p className="mt-1 leading-none">
          <span
            className="nums text-[20px] font-semibold"
            style={{
              fontFamily: "var(--font-geist-mono)",
              color: progress.isDeload
                ? DELOAD_BLUE
                : progress.isPR
                  ? PR_LIME
                  : "var(--fg)",
            }}
          >
            {progress.top}
          </span>
          {progress.delta && (
            <span
              className="nums text-[12px] font-semibold ml-2"
              style={{ fontFamily: "var(--font-geist-mono)", color }}
            >
              {progress.delta}
            </span>
          )}
        </p>
      </div>
      <Sparkline
        values={progress.trend}
        color={line}
        label={`${progress.lift} top set trend`}
      />
    </div>
  );
}
