"use client";

import { useState } from "react";
import NewChallengeForm from "@/components/NewChallengeForm";

type Person = { id: string; name: string };
type Exercise = { id: string; name: string };

export default function ChallengeCreateSection({
  people,
  exercises,
}: {
  people: Person[];
  exercises: Exercise[];
}) {
  const [open, setOpen] = useState(false);

  if (open) {
    return (
      <NewChallengeForm
        people={people}
        exercises={exercises}
        onDone={() => setOpen(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="btn-accent w-full py-3 rounded-xl text-[14px] mb-5"
    >
      + New challenge
    </button>
  );
}
