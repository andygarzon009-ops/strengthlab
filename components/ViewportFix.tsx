"use client";

import { useEffect } from "react";

const EDITABLE = "input, textarea, select, [contenteditable='true']";

/// iOS (installed PWA) sometimes leaves the layout viewport short after the
/// keyboard closes, or after the app comes back from the background: every
/// fixed element (bottom nav, timer and coach buttons) then sits halfway up
/// the screen with the page showing underneath, until something forces a
/// relayout. A same-spot scroll is that something, so it runs whenever the
/// keyboard has gone away or the app is shown again. Harmless when nothing
/// is stuck: the page doesn't move.
export default function ViewportFix() {
  useEffect(() => {
    const timers: number[] = [];
    const nudge = () => {
      for (const t of timers.splice(0)) clearTimeout(t);
      // Twice: once the keyboard starts closing, once it has finished.
      for (const ms of [60, 400]) {
        timers.push(
          window.setTimeout(() => {
            if (document.activeElement?.matches(EDITABLE)) return; // keyboard still up
            if (document.body.style.position === "fixed") return; // a sheet holds the scroll
            const x = window.scrollX;
            const y = window.scrollY;
            window.scrollTo(x, y + 1);
            window.scrollTo(x, y);
          }, ms),
        );
      }
    };
    const vv = window.visualViewport;
    let lastH = vv?.height ?? window.innerHeight;
    const onResize = () => {
      const h = vv?.height ?? window.innerHeight;
      if (h > lastH + 40) nudge(); // grew back: the keyboard closed
      lastH = h;
    };
    const onShow = () => {
      if (document.visibilityState === "visible") nudge();
    };
    document.addEventListener("focusout", nudge);
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("pageshow", nudge);
    window.addEventListener("orientationchange", nudge);
    vv?.addEventListener("resize", onResize);
    return () => {
      for (const t of timers) clearTimeout(t);
      document.removeEventListener("focusout", nudge);
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("pageshow", nudge);
      window.removeEventListener("orientationchange", nudge);
      vv?.removeEventListener("resize", onResize);
    };
  }, []);
  return null;
}
