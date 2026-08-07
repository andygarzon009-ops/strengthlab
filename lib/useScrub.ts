"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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

  // The track's box, measured once per gesture rather than per move.
  // getBoundingClientRect forces layout, and doing that on every pointer
  // event — which fire faster than the screen refreshes — is a real cost on a
  // phone. Nothing can move the track mid-drag: the plot is touch-action:none,
  // so the page can't scroll under the finger. Non-null means a scrub is live.
  const boxRef = useRef<{ left: number; width: number } | null>(null);

  // Moves are folded into one state update per animation frame. A finger
  // produces several pointermove events per frame on a 120Hz screen; acting on
  // each one meant several full re-renders per painted frame, which is what
  // made the drag feel like it was chasing the thumb.
  const pendingX = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    rafRef.current = null;
    const x = pendingX.current;
    const box = boxRef.current;
    pendingX.current = null;
    if (x == null || !box) return;
    setFrac(Math.max(0, Math.min(1, (x - box.left) / box.width)));
  }, []);

  const end = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    pendingX.current = null;
    boxRef.current = null;
    setFrac(null);
  }, []);

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const handlers = {
    onPointerDown: (e: React.PointerEvent<T>) => {
      const el = e.currentTarget;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return;
      // Capture so the finger can leave the element mid-drag without the
      // readout dying — you're aiming at a 2px line on a phone.
      el.setPointerCapture(e.pointerId);
      boxRef.current = { left: rect.left, width: rect.width };
      setTrackWidth(rect.width);
      // Straight to state, no frame of delay: a tap should land instantly.
      setFrac(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    },
    onPointerMove: (e: React.PointerEvent<T>) => {
      // Only a gesture that started on the track scrubs — a mouse merely
      // hovering across isn't dragging anything.
      if (!boxRef.current) return;
      pendingX.current = e.clientX;
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(flush);
    },
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: (e: React.PointerEvent<T>) => {
      // Touch keeps its readout until release; a mouse leaving means done.
      if (e.pointerType === "mouse") end();
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
