"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addPostComment,
  createGroupPost,
  deleteGroupPost,
  togglePostReaction,
} from "@/lib/actions/posts";
import { formatDistanceToNow } from "date-fns";

type Post = {
  id: string;
  text: string;
  imageUrl: string | null;
  workoutId: string | null;
  createdAt: string;
  user: { id: string; name: string };
  workout: {
    id: string;
    title: string;
    type: string;
    date: string;
  } | null;
  comments: {
    id: string;
    text: string;
    createdAt: string;
    user: { id: string; name: string };
  }[];
  reactions: {
    id: string;
    type: string;
    user: { id: string; name: string };
  }[];
};

const REACTIONS = ["🔥", "💪", "👏", "🫡"];

export default function GroupFeed({ groupId }: { groupId: string }) {
  const [data, setData] = useState<{
    posts: Post[];
    currentUserId: string;
  } | null>(null);
  const [composing, setComposing] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/groups/${groupId}/feed`);
    if (res.ok) setData(await res.json());
  };

  useEffect(() => {
    load();
  }, [groupId]);

  if (!data) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-3">
        <p
          className="label text-[10px]"
          style={{ color: "var(--fg-dim)" }}
        >
          Crew feed
        </p>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="text-[11px] label"
          style={{ color: "var(--accent)" }}
        >
          {composing ? "Cancel" : "+ Post"}
        </button>
      </div>

      {composing && (
        <Composer
          groupId={groupId}
          onDone={() => {
            setComposing(false);
            load();
          }}
        />
      )}

      {data.posts.length === 0 && !composing ? (
        <p
          className="text-[12px] py-3"
          style={{ color: "var(--fg-muted)" }}
        >
          No posts yet. Be the first to share.
        </p>
      ) : (
        <div className="space-y-3">
          {data.posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={data.currentUserId}
              onChanged={load}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Composer({
  groupId,
  onDone,
}: {
  groupId: string;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = () => fileRef.current?.click();

  const onFile = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");
      setImageUrl(body.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const submit = () => {
    setError("");
    startTransition(async () => {
      const result = await createGroupPost({
        groupId,
        text,
        imageUrl: imageUrl ?? undefined,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      setText("");
      setImageUrl(null);
      onDone();
    });
  };

  return (
    <div className="card p-3 mb-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Share a win, a photo, a thought…"
        rows={3}
        className="w-full rounded-lg px-3 py-2 text-[13px] focus:outline-none resize-none"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
        }}
      />

      {imageUrl && (
        <div className="mt-2 relative">
          <img
            src={imageUrl}
            alt=""
            className="w-full rounded-lg"
            style={{ maxHeight: 260, objectFit: "cover" }}
          />
          <button
            type="button"
            onClick={() => setImageUrl(null)}
            className="absolute top-2 right-2 text-[11px] px-2 py-1 rounded-md"
            style={{
              background: "rgba(0,0,0,0.6)",
              color: "#fff",
            }}
          >
            Remove
          </button>
        </div>
      )}

      {error && (
        <p className="text-[11px] mt-2" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={pickFile}
          disabled={uploading || pending}
          className="btn-ghost px-3 py-2 rounded-lg text-[11px] label"
        >
          {uploading ? "Uploading…" : "📷 Photo"}
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={submit}
          disabled={pending || uploading}
          className="btn-accent px-4 py-2 rounded-lg text-[12px]"
        >
          {pending ? "Posting…" : "Post"}
        </button>
      </div>
    </div>
  );
}

function PostCard({
  post,
  currentUserId,
  onChanged,
}: {
  post: Post;
  currentUserId: string;
  onChanged: () => void;
}) {
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [pending, startTransition] = useTransition();

  const reactionCounts = post.reactions.reduce<Record<string, number>>(
    (acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const myReactions = new Set(
    post.reactions.filter((r) => r.user.id === currentUserId).map((r) => r.type)
  );

  const submitComment = () => {
    if (!commentText.trim()) return;
    startTransition(async () => {
      await addPostComment(post.id, commentText);
      setCommentText("");
      setCommenting(false);
      onChanged();
    });
  };

  const toggleReact = (type: string) => {
    startTransition(async () => {
      await togglePostReaction(post.id, type);
      onChanged();
    });
  };

  const remove = () => {
    if (!confirm("Delete this post?")) return;
    startTransition(async () => {
      await deleteGroupPost(post.id);
      onChanged();
    });
  };

  const canDelete = post.user.id === currentUserId;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
            style={{
              background: "var(--accent-dim)",
              color: "var(--accent)",
            }}
          >
            {post.user.name[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-none">
              {post.user.name}
            </p>
            <p
              className="text-[10px] mt-0.5 nums"
              style={{
                color: "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              {formatDistanceToNow(new Date(post.createdAt), {
                addSuffix: true,
              })}
            </p>
          </div>
        </div>
        {canDelete && (
          <button
            onClick={remove}
            disabled={pending}
            className="text-[10px] label"
            style={{ color: "var(--fg-dim)" }}
          >
            Delete
          </button>
        )}
      </div>

      {post.text && (
        <p className="text-[13px] whitespace-pre-wrap mb-2">{post.text}</p>
      )}

      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt=""
          className="w-full rounded-lg mb-2"
          style={{ maxHeight: 420, objectFit: "cover" }}
        />
      )}

      {post.workout && (
        <a
          href={`/workout/${post.workout.id}`}
          className="block rounded-lg px-3 py-2 mb-2 text-[12px]"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
          }}
        >
          <p className="font-semibold">🏋️ {post.workout.title}</p>
        </a>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-2">
        {REACTIONS.map((r) => {
          const count = reactionCounts[r] ?? 0;
          const mine = myReactions.has(r);
          return (
            <button
              key={r}
              onClick={() => toggleReact(r)}
              disabled={pending}
              className="text-[13px] px-2.5 py-1 rounded-full"
              style={{
                background: mine ? "var(--accent-dim)" : "var(--bg-elevated)",
                border: mine
                  ? "1px solid rgba(34,197,94,0.4)"
                  : "1px solid var(--border)",
                color: mine ? "var(--accent)" : "var(--fg)",
              }}
            >
              {r}
              {count > 0 && (
                <span
                  className="ml-1 nums text-[11px]"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => setCommenting((v) => !v)}
          className="text-[11px] label ml-auto"
          style={{ color: "var(--fg-dim)" }}
        >
          💬 {post.comments.length || "Comment"}
        </button>
      </div>

      {post.comments.length > 0 && (
        <div
          className="mt-3 pt-3 space-y-1.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {post.comments.map((c) => (
            <p key={c.id} className="text-[12px]">
              <span className="font-semibold">{c.user.name}</span>{" "}
              <span style={{ color: "var(--fg-muted)" }}>{c.text}</span>
            </p>
          ))}
        </div>
      )}

      {commenting && (
        <div className="flex gap-2 mt-3">
          <input
            autoFocus
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitComment();
            }}
            placeholder="Reply…"
            className="flex-1 rounded-lg px-3 py-2 text-[12px] focus:outline-none"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          />
          <button
            onClick={submitComment}
            disabled={pending || !commentText.trim()}
            className="btn-accent px-3 rounded-lg text-[12px]"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
