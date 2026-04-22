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
    <div className="border-t border-zinc-800 px-4 py-3 space-y-2">
      {comments.length > 2 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
        >
          View all {comments.length} comments
        </button>
      )}
      {displayedComments.map((c) => (
        <div key={c.id} className="flex gap-2">
          <div className="w-6 h-6 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold text-zinc-300 flex-shrink-0 mt-0.5">
            {c.user.name[0].toUpperCase()}
          </div>
          <div>
            <span className="text-white text-sm font-medium">
              {c.userId === currentUserId ? "You" : c.user.name}
            </span>{" "}
            <span className="text-zinc-300 text-sm">{c.text}</span>
            <p className="text-zinc-600 text-xs mt-0.5">
              {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
            </p>
          </div>
        </div>
      ))}

      <form onSubmit={handleSubmit} className="flex gap-2 mt-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a comment..."
          className="flex-1 bg-zinc-800 text-white placeholder-zinc-600 text-sm px-3 py-2 rounded-xl focus:outline-none focus:border-zinc-600 border border-transparent"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="bg-orange-500 disabled:opacity-30 text-white px-3 py-2 rounded-xl text-sm font-medium transition-opacity"
        >
          Send
        </button>
      </form>
    </div>
  );
}
