"use client";

import { addComment } from "@/lib/actions/workouts";
import { formatDistanceToNow } from "date-fns";
import { useState, useTransition } from "react";

type Comment = {
  id: string;
  text: string;
  createdAt: Date;
  user: { name: string };
  userId: string;
};

export default function CommentSection({
  workoutId,
  comments,
  currentUserId,
}: {
  workoutId: string;
  comments: Comment[];
  currentUserId: string;
}) {
  const [text, setText] = useState("");
  const [, startTransition] = useTransition();
  const [showAll, setShowAll] = useState(false);

  const displayedComments = showAll ? comments : comments.slice(-2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    startTransition(() => addComment(workoutId, text));
    setText("");
  };

  return (
    <div
      className="px-4 py-3 space-y-3"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      {comments.length > 2 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="label text-[10px] transition-colors"
          style={{ color: "var(--fg-dim)" }}
        >
          View all {comments.length} comments
        </button>
      )}
      {displayedComments.map((c) => (
        <div key={c.id} className="flex gap-2.5">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5"
            style={{
              background: "var(--bg-elevated)",
              color: "var(--fg-muted)",
            }}
          >
            {c.user.name[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[13px] font-semibold">
              {c.userId === currentUserId ? "You" : c.user.name}
            </span>{" "}
            <span
              className="text-[13px]"
              style={{ color: "var(--fg-muted)" }}
            >
              {c.text}
            </span>
            <p
              className="text-[10px] mt-0.5 nums"
              style={{
                color: "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}

      <form onSubmit={handleSubmit} className="flex gap-2 pt-1">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment…"
          className="flex-1 text-[13px] px-3 py-2 rounded-lg focus:outline-none"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="btn-accent px-3 py-2 rounded-lg text-[12px]"
        >
          Send
        </button>
      </form>
    </div>
  );
}
