"use client";

import { useState } from "react";
import Tutorial from "./Tutorial";

export default function TutorialLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="card flex items-center justify-between px-4 py-4 transition-colors w-full"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--bg-elevated)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div className="text-left">
            <p className="text-[13px] font-semibold">App tour</p>
            <p
              className="text-[11px] mt-0.5"
              style={{ color: "var(--fg-dim)" }}
            >
              Re-watch the StrengthLab walkthrough
            </p>
          </div>
        </div>
        <span className="text-[16px]" style={{ color: "var(--fg-dim)" }}>
          →
        </span>
      </button>
      <Tutorial open={open} onClose={() => setOpen(false)} />
    </>
  );
}
