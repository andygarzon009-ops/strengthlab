"use client";

import { useRef, useState, type ReactNode } from "react";

const REVEAL = 84;

/// A list row that slides left to show a red Delete behind it, the iOS way.
/// Vertical drags still scroll the page (touch-action: pan-y); a sideways
/// drag past halfway snaps it open. While it's open, a tap on the row only
/// closes it, so opening one can't also log the meal underneath.
export default function SwipeRow({
  children,
  onDelete,
  label = "Delete",
  bg = "var(--bg-card)",
}: {
  children: ReactNode;
  onDelete: () => void;
  label?: string;
  /// The row's own background, so it covers the button until swiped.
  bg?: string;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const open = dx <= -REVEAL / 2 && !dragging;
  const touch = useRef<{ x: number; y: number; base: number; dir: "h" | "v" | null } | null>(null);
  // A sideways drag ends in a click on whatever was under the finger.
  const swallowClick = useRef(false);

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        onClick={() => {
          setDx(0);
          onDelete();
        }}
        aria-label={label}
        tabIndex={dx < 0 ? 0 : -1}
        className="absolute inset-y-0 right-0 flex items-center justify-center text-[13px] font-bold text-white"
        style={{ width: REVEAL, background: "#dc2626" }}
      >
        {label}
      </button>
      <div
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY, base: dx, dir: null };
        }}
        onTouchMove={(e) => {
          const s = touch.current;
          const t = e.touches[0];
          if (!s || !t) return;
          const mx = t.clientX - s.x;
          const my = t.clientY - s.y;
          if (!s.dir && Math.hypot(mx, my) > 8) s.dir = Math.abs(mx) > Math.abs(my) ? "h" : "v";
          if (s.dir !== "h") return;
          setDragging(true);
          setDx(Math.max(-REVEAL * 1.4, Math.min(0, s.base + mx)));
        }}
        onTouchEnd={() => {
          const s = touch.current;
          touch.current = null;
          if (s?.dir !== "h") return;
          swallowClick.current = true;
          setDragging(false);
          setDx((d) => (d < -REVEAL / 2 ? -REVEAL : 0));
        }}
        onClickCapture={(e) => {
          if (swallowClick.current || open) {
            e.preventDefault();
            e.stopPropagation();
            swallowClick.current = false;
            if (open) setDx(0);
          }
        }}
        className="relative"
        style={{
          transform: `translateX(${dx}px)`,
          transition: dragging ? "none" : "transform 180ms ease-out",
          touchAction: "pan-y",
          background: bg,
        }}
      >
        {children}
      </div>
    </div>
  );
}
