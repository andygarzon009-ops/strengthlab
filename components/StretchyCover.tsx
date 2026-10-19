"use client";

import { useEffect, useRef } from "react";

/// A cover that stretches instead of detaching. On iOS, pulling past the top
/// rubber-bands the whole page down and leaves a black gap above the cover —
/// it reads as the page falling. Here the cover grows from its bottom edge by
/// exactly the overscroll, so the gap is always filled with cover.
export default function StretchyCover({
  background,
  children,
}: {
  background: string;
  children?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const apply = () => {
      frame = 0;
      const pull = Math.max(0, -window.scrollY);
      const h = el.offsetHeight || 1;
      // Uniform scale keeps a photo's proportions; width overflow is clipped
      // by the wrapper.
      el.style.transform = pull > 0 ? `scale(${1 + pull / h})` : "";
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden"
      style={{ background, transformOrigin: "50% 100%", willChange: "transform" }}
    >
      {children}
    </div>
  );
}
