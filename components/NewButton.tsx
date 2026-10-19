"use client";

import NewChooser from "@/components/NewChooser";

/// The feed header's "+ New": asks workout or meal.
export default function NewButton() {
  return (
    <NewChooser
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="btn-accent px-4 py-2.5 rounded-xl text-sm inline-flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          New
        </button>
      )}
    />
  );
}
