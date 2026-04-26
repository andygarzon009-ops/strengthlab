"use client";

import { useEffect, useState } from "react";
import Tutorial, { hasSeenTutorial } from "./Tutorial";

export default function TutorialAutoOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenTutorial()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true);
    }
  }, []);

  return <Tutorial open={open} onClose={() => setOpen(false)} />;
}
