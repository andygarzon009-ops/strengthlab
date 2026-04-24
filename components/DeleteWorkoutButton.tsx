"use client";

import { useTransition } from "react";

export default function DeleteWorkoutButton({
  action,
  title,
}: {
  action: () => Promise<void>;
  title: string;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        const ok = window.confirm(
          `Delete "${title}"? This permanently removes the workout, all its sets, and any PRs earned in it. This cannot be undone.`
        );
        if (!ok) return;
        startTransition(() => {
          action();
        });
      }}
      className="text-[12px] label"
      style={{ color: "#f87171", opacity: isPending ? 0.5 : 1 }}
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
