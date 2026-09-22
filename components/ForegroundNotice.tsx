"use client";

// The in-app half of "never banner over an app that's already open".
//
// A system notification drawn while the PWA is on screen takes focus off the
// page — on iOS that means the software keyboard retracts, so a push landing
// while someone is typing a weight, a comment or a message to the coach
// silently ends their entry. The service worker therefore posts nothing
// visible while a client is on screen (see public/sw.js) and messages the page
// instead; this is what the page does with it.
//
// It is a plain div: no dialog, no autofocus, nothing focusable until tapped,
// so it can never take the caret from a field the way the banner did.

import Link from "next/link";
import { useEffect, useState } from "react";

export type ForegroundNotice = {
  id: number;
  title: string;
  body?: string;
  url?: string | null;
};

/// How long a notice sits there before fading out on its own.
const DISMISS_MS = 6000;

/// Rest is already announced on screen by the timer FAB — its chime and the
/// REST DONE pill. A second cue for the same thing is noise.
const SILENT_TAGS = new Set(["rest-end"]);

export function showForegroundNotice(n: {
  title: string;
  body?: string;
  url?: string | null;
}) {
  window.dispatchEvent(
    new CustomEvent("strengthlab:in-app-notice", { detail: n }),
  );
}

export default function ForegroundNotice() {
  const [notice, setNotice] = useState<ForegroundNotice | null>(null);

  useEffect(() => {
    let seq = 0;
    const show = (n: { title: string; body?: string; url?: string | null }) => {
      seq += 1;
      setNotice({ id: seq, title: n.title, body: n.body, url: n.url ?? null });
    };

    const onMessage = (e: MessageEvent) => {
      const d = e.data as
        | { kind?: string; title?: string; body?: string; tag?: string; url?: string | null }
        | undefined;
      if (!d || d.kind !== "strengthlab:foreground-push") return;
      if (d.tag && SILENT_TAGS.has(d.tag)) return;
      show({ title: d.title ?? "StrengthLab", body: d.body, url: d.url });
    };

    const onEvent = (e: Event) => {
      const d = (e as CustomEvent<{ title: string; body?: string; url?: string | null }>)
        .detail;
      if (!d?.title) return;
      show(d);
    };

    navigator.serviceWorker?.addEventListener("message", onMessage);
    window.addEventListener("strengthlab:in-app-notice", onEvent);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
      window.removeEventListener("strengthlab:in-app-notice", onEvent);
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), DISMISS_MS);
    return () => clearTimeout(t);
  }, [notice]);

  if (!notice) return null;

  const body = (
    <div
      className="rounded-2xl px-4 py-3 backdrop-blur-xl"
      style={{
        background: "rgba(20,20,20,0.92)",
        border: "1px solid var(--border-strong)",
        boxShadow: "0 12px 30px -12px rgba(0,0,0,0.9)",
      }}
    >
      <p className="text-[13px] font-semibold" style={{ color: "var(--fg)" }}>
        {notice.title}
      </p>
      {notice.body && (
        <p className="text-[12px] mt-0.5" style={{ color: "var(--fg-muted)" }}>
          {notice.body}
        </p>
      )}
    </div>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-3 right-3 z-[95] in-app-notice"
      style={{ top: "calc(env(safe-area-inset-top, 0px) + 10px)" }}
      onClick={() => setNotice(null)}
    >
      {notice.url ? (
        <Link href={notice.url} className="block">
          {body}
        </Link>
      ) : (
        body
      )}
      <style>{`
        @keyframes in-app-notice-in {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .in-app-notice { animation: in-app-notice-in 180ms ease-out; }
      `}</style>
    </div>
  );
}
