import { useCallback, useEffect, useRef, type TouchEvent } from "react";

let nextId = 0;

/// A bottom sheet as a step in history. Opening it pushes an entry, so the
/// iOS back swipe or Android back button closes the sheet and leaves you on
/// the page underneath — without it, back skipped the whole page.
///
/// Every close should go through the returned `dismiss`: it steps back off the
/// sheet's entry and the popstate does the closing, then runs `then` (open the
/// next sheet, navigate). Ordering it after the popstate matters — a
/// `history.back()` racing a fresh `pushState` would pop the wrong entry.
///
/// `grab` goes on the sheet's handle strip: drag it down to close.
export function useSheetBack(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  const afterRef = useRef<(() => void) | null>(null);
  const idRef = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const id = ++nextId;
    idRef.current = id;
    // Keep Next's own history state, or its router reloads the page on pop.
    window.history.pushState({ ...window.history.state, __sheet: id }, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      closeRef.current();
      const then = afterRef.current;
      afterRef.current = null;
      then?.();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      idRef.current = null;
      // Closed some other way (unmount, a missed path): don't leave a dead
      // back step behind.
      if (!popped && window.history.state?.__sheet === id) window.history.back();
    };
  }, [open]);

  const dismiss = useCallback((then?: () => void) => {
    if (idRef.current != null && window.history.state?.__sheet === idRef.current) {
      afterRef.current = then ?? null;
      window.history.back();
    } else {
      closeRef.current();
      then?.();
    }
  }, []);

  const grab = {
    onTouchStart: (e: TouchEvent) => {
      // Only from the top: mid-scroll, a downward drag is scrolling back up.
      const dialog = (e.currentTarget as HTMLElement).closest('[role="dialog"]');
      const scrolled = dialog ? dialog.scrollTop > 0 : false;
      startY.current = scrolled ? null : (e.touches[0]?.clientY ?? null);
    },
    onTouchEnd: (e: TouchEvent) => {
      const y0 = startY.current;
      startY.current = null;
      const y1 = e.changedTouches[0]?.clientY;
      if (y0 != null && y1 != null && y1 - y0 > 60) dismiss();
    },
  };

  return { dismiss, grab };
}

/// The sheet's ✕, top right — a way out you can see, not just a gesture.
export function SheetClose({ onClick, label = "Close" }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="absolute top-2 right-2 z-10 w-9 h-9 rounded-full flex items-center justify-center active:scale-95"
      style={{ background: "rgba(255,255,255,0.08)", color: "var(--fg-muted)" }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/// A tap on the dimmed backdrop. With the keyboard up, the first tap outside
/// just puts the keyboard away — closing the sheet there threw away edits.
export function backdropTap(close: () => void) {
  const el = document.activeElement;
  if (el instanceof HTMLElement && el.matches("input, textarea, select, [contenteditable]")) {
    el.blur();
    return;
  }
  close();
}
