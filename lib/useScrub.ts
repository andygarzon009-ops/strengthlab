"use client";

import { useRef, useState } from "react";

/// Press-and-drag readout for a time-series chart, factored out of
/// SleepHypnogram so heart rate behaves identically to sleep — same gesture,
/// same release behaviour, same feel.
///
/// Returns a fraction 0..1 across the track, or null when not scrubbing.
/// Mapping that fraction to a data point is the caller's job, since only it
/// knows where its plot area sits inside the element.
export function useScrub<T extends HTMLElement = HTMLDivElement>() {
  const trackRef = useRef<T>(null);
  const [frac, setFrac] = useState<number | null>(null);
  // Measured on each scrub, so a caller with pixel-based plot insets (recharts
  // margins, SVG padding) can convert them to fractions without its own
  // observer. Zero until the first interaction.
  const [trackWidth, setTrackWidth] = useState(0);

  const updateFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    setTrackWidth(rect.width);
    setFrac(Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)));
  };

  const handlers = {
    onPointerDown: (e: React.PointerEvent<T>) => {
      // Capture so the finger can leave the element mid-drag without the
      // readout dying — you're aiming at a 2px line on a phone.
      e.currentTarget.setPointerCapture(e.pointerId);
      updateFromClientX(e.clientX);
    },
    onPointerMove: (e: React.PointerEvent<T>) => {
      // A mouse hovering with no button held isn't scrubbing.
      if (e.buttons === 0 && e.pointerType === "mouse") return;
      if (frac != null || e.buttons !== 0) updateFromClientX(e.clientX);
    },
    onPointerUp: () => setFrac(null),
    onPointerCancel: () => setFrac(null),
    onPointerLeave: (e: React.PointerEvent<T>) => {
      // Touch keeps its readout until release; a mouse leaving means done.
      if (e.pointerType === "mouse") setFrac(null);
    },
  };

  return { trackRef, frac, trackWidth, handlers };
}

/// Nearest sample to a scrub position, given the plot's horizontal insets.
/// `frac` spans the whole element, but the data only occupies the area
/// between the paddings — without this the readout drifts at the edges.
export function scrubIndex(
  frac: number,
  count: number,
  padLeftPct: number,
  padRightPct: number
): number {
  if (count <= 0) return -1;
  const span = 1 - padLeftPct - padRightPct;
  if (span <= 0) return -1;
  const t = (frac - padLeftPct) / span;
  return Math.max(0, Math.min(count - 1, Math.round(t * (count - 1))));
}
