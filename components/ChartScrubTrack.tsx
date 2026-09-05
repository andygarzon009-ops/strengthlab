"use client";

import { useMemo, useRef, type ReactNode } from "react";
import { useScrub } from "@/lib/useScrub";

/// Nearest datum to a scrub position. `frac` spans the whole element while the
/// data only occupies the plot area between the paddings, so the fraction is
/// mapped through those insets first — otherwise the cursor and the value
/// drift apart at both edges.
///
/// Unlike scrubIndex() this matches on each datum's own x position rather than
/// assuming even spacing: training sessions land on the days they land on, and
/// an index-based match would put the readout on the wrong session after any
/// gap.
function nearestIndex(
  frac: number,
  xFracs: number[],
  padLeft: number,
  padRight: number,
): number | null {
  if (xFracs.length === 0) return null;
  const span = 1 - padLeft - padRight;
  if (span <= 0) return null;
  const t = (frac - padLeft) / span;
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < xFracs.length; i++) {
    const d = Math.abs(xFracs[i] - t);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/// A tap moves the pointer a few pixels even when the finger means to hold
/// still, so anything under this is a tap rather than a drag.
const TAP_SLOP_PX = 6;

/// Press-and-drag readout over a chart, the same gesture the heart-rate and
/// sleep charts use. Owns the scrub, the readout header and the cursor line;
/// the caller supplies the chart and decides how a reading is worded.
export default function ChartScrubTrack({
  xFracs,
  padLeft,
  padRight,
  hint,
  readout,
  onTap,
  children,
}: {
  /// Each datum's position within the plot area, 0..1, in draw order.
  xFracs: number[];
  /// Plot insets as a fraction of the element's width.
  padLeft: number;
  padRight: number;
  /// Shown in the header while nothing is being read.
  hint: ReactNode;
  /// Shown in the header while scrubbing.
  readout: (index: number) => ReactNode;
  /// Called when the gesture was a tap rather than a drag.
  onTap?: (index: number) => void;
  children: (activeIndex: number | null) => ReactNode;
}) {
  const { trackRef, frac, handlers } = useScrub<HTMLDivElement>();
  const downX = useRef<number | null>(null);
  const moved = useRef(false);

  const idx = useMemo(
    () => (frac == null ? null : nearestIndex(frac, xFracs, padLeft, padRight)),
    [frac, xFracs, padLeft, padRight],
  );

  const composed = {
    ...handlers,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      downX.current = e.clientX;
      moved.current = false;
      handlers.onPointerDown(e);
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (
        downX.current != null &&
        Math.abs(e.clientX - downX.current) > TAP_SLOP_PX
      ) {
        moved.current = true;
      }
      handlers.onPointerMove(e);
    },
    onPointerUp: () => {
      if (!moved.current && idx != null) onTap?.(idx);
      downX.current = null;
      handlers.onPointerUp();
    },
  };

  return (
    <div>
      {/* Fixed height so the chart doesn't jump when a reading appears. */}
      <div className="min-h-[34px] mb-1">
        {idx != null ? readout(idx) : hint}
      </div>
      <div
        ref={trackRef}
        // touch-none, not pan-y: with pan-y the browser grabs the gesture as
        // soon as the thumb drifts vertically and the scrub dies mid-drag.
        // The page still scrolls from anywhere outside the plot.
        className="relative touch-none cursor-ew-resize select-none"
        data-chart-scrub
        {...composed}
      >
        {children(idx)}
        {idx != null && (
          <div
            className="absolute top-0 bottom-0 pointer-events-none"
            style={{
              left: `${(padLeft + xFracs[idx] * (1 - padLeft - padRight)) * 100}%`,
              width: 1.5,
              marginLeft: -0.75,
              background: "var(--fg)",
              opacity: 0.9,
            }}
          />
        )}
      </div>
    </div>
  );
}
