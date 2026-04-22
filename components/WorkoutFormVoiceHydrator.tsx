"use client";

import { useEffect, useState } from "react";
import WorkoutForm, { type WorkoutFormInitial } from "@/components/WorkoutForm";

export default function WorkoutFormVoiceHydrator() {
  const [initial, setInitial] = useState<WorkoutFormInitial | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("sl:voiceDraft");
      if (raw) {
        setInitial(JSON.parse(raw) as WorkoutFormInitial);
        sessionStorage.removeItem("sl:voiceDraft");
      }
    } catch {
      // ignore
    }
    setReady(true);
  }, []);

  if (!ready) return null;
  return <WorkoutForm mode="create" initial={initial ?? undefined} />;
}
