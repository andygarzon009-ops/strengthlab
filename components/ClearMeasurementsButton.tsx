"use client";

import { useState, useTransition } from "react";
import { clearBodyMeasurements } from "@/lib/actions/measurements";

export default function ClearMeasurementsButton({ checkIns }: { checkIns: number }) {
  const [isPending, startTransition] = useTransition();
  const [cleared, setCleared] = useState(false);

  if (cleared) {
    return (
      <p className="text-[12px] px-1" style={{ color: "var(--fg-dim)" }}>
        Measurement history cleared.
      </p>
    );
  }

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        const ok = window.confirm(
          `Clear all body measurements? This permanently deletes ${checkIns} check-in${checkIns === 1 ? "" : "s"} and your saved tape and body-fat numbers. Bodyweight and height stay. This cannot be undone.`,
        );
        if (!ok) return;
        startTransition(async () => {
          await clearBodyMeasurements();
          setCleared(true);
        });
      }}
      className="text-[12px] label px-1 min-h-11"
      style={{ color: "#f87171", opacity: isPending ? 0.5 : 1 }}
    >
      {isPending ? "Clearing…" : "Clear measurement history"}
    </button>
  );
}
