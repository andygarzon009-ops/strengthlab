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
const POLL_MS = 6000;

export default function GroupFeed({ groupId }: { groupId: string }) {
  const [data, setData] = useState<{
    posts: Post[];
    currentUserId: string;
  } | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<string | null>(null);

  const load = async (scrollToBottom = false) => {
    const res = await fetch(`/api/groups/${groupId}/feed`);
    if (!res.ok) return;
    const body = await res.json();
    // API returns newest-first; flip for chat ordering.
    body.posts = body.posts.slice().reverse();
    const newestId = body.posts[body.posts.length - 1]?.id ?? null;
    const gotNew = newestId && newestId !== latestIdRef.current;
    latestIdRef.current = newestId;
    setData(body);
    if ((scrollToBottom || gotNew) && scrollerRef.current) {
      requestAnimationFrame(() => {
        scrollerRef.current!.scrollTop = scrollerRef.current!.scrollHeight;
      });
    }
  };

  useEffect(() => {
    load(true);
    const t = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  if (!data) return null;

  return (
    <div
      className="mt-4 rounded-2xl overflow-hidden flex flex-col"
      style={{
        border: "1px solid var(--border)",
        background: "var(--bg-card)",
        height: 520,
      }}
    >
      <div
        className="px-3 py-2.5 flex items-center justify-between"
        style={{
          borderBottom: "1px solid var(--border)",
          background: "var(--bg-elevated)",
        }}
      >
        <p
          className="label text-[10px]"
          style={{ color: "var(--fg-dim)" }}
        >
          Crew chat
        </p>
        <span
          className="text-[10px] nums"
          style={{
            color: "var(--fg-dim)",
            fontFamily: "var(--font-geist-mono)",
          }}
        >
          {data.posts.length} msg
        </span>
      </div>

      <div
        ref={scrollerRef}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
      >
        {data.posts.length === 0 ? (
          <p
            className="text-[12px] text-center py-10"
            style={{ color: "var(--fg-muted)" }}
          >
            No messages yet. Say hi, drop a workout, or post a photo.
          </p>
        ) : (
          data.posts.map((post) => (
            <Message
              key={post.id}
              post={post}
              currentUserId={data.currentUserId}
              onChanged={() => load(false)}
            />
          ))
        )}
      </div>

      <Composer groupId={groupId} onSent={() => load(true)} />
    </div>
  );
}

function Composer({
  groupId,
  onSent,
}: {
  groupId: string;
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (!text.trim() && !imageUrl) return;
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
      onSent();
    });
  };

  return (
    <div
      className="px-2.5 py-2.5"
      style={{
        borderTop: "1px solid var(--border)",
        background: "var(--bg-elevated)",
      }}
    >
      {imageUrl && (
        <div className="relative mb-2">
          <img
            src={imageUrl}
            alt=""
            className="rounded-lg"
            style={{ maxHeight: 120, objectFit: "cover" }}
          />
          <button
            type="button"
            onClick={() => setImageUrl(null)}
            className="absolute top-1 right-1 text-[10px] px-2 py-0.5 rounded-md"
            style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}
          >
            Remove
          </button>
        </div>
      )}
      {error && (
        <p className="text-[11px] mb-1" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}
      <div className="flex items-end gap-1.5">
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
          onClick={() => fileRef.current?.click()}
          disabled={uploading || pending}
          className="shrink-0 w-9 h-9 rounded-lg text-[15px] flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
          aria-label="Attach photo"
        >
          {uploading ? "…" : "📷"}
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Message the crew…"
          rows={1}
          className="flex-1 rounded-lg px-3 py-2 text-[13px] focus:outline-none resize-none"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
            maxHeight: 100,
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending || uploading || (!text.trim() && !imageUrl)}
          className="shrink-0 btn-accent w-9 h-9 rounded-lg text-[14px] font-semibold flex items-center justify-center"
          aria-label="Send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

function Message({
  post,
  currentUserId,
  onChanged,
}: {
  post: Post;
  currentUserId: string;
  onChanged: () => void;
}) {
  const [showReact, setShowReact] = useState(false);
  const [commenting, setCommenting] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [pending, startTransition] = useTransition();
  const isOwn = post.user.id === currentUserId;
  const isAuto = !post.text && post.workoutId;

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

  const toggleReact = (type: string) => {
    startTransition(async () => {
      await togglePostReaction(post.id, type);
      onChanged();
      setShowReact(false);
    });
  };

  const submitComment = () => {
    if (!commentText.trim()) return;
    startTransition(async () => {
      await addPostComment(post.id, commentText);
      setCommentText("");
      setCommenting(false);
      onChanged();
    });
  };

  const remove = () => {
    if (!confirm("Delete this message?")) return;
    startTransition(async () => {
      await deleteGroupPost(post.id);
      onChanged();
    });
  };

  return (
    <div
      className={`flex gap-2 ${isOwn ? "flex-row-reverse" : ""}`}
    >
      {!isOwn && (
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 mt-4"
          style={{
            background: "var(--accent-dim)",
            color: "var(--accent)",
          }}
        >
          {post.user.name[0]?.toUpperCase()}
        </div>
      )}

      <div className={`min-w-0 ${isOwn ? "items-end" : "items-start"} flex flex-col max-w-[80%]`}>
        {!isOwn && (
          <p
            className="text-[10px] mb-0.5 px-1"
            style={{ color: "var(--fg-dim)" }}
          >
            {post.user.name}
          </p>
        )}

        <div
          className="rounded-2xl px-3 py-2"
          style={{
            background: isOwn ? "var(--accent-dim)" : "var(--bg-elevated)",
            border: isOwn
              ? "1px solid rgba(34,197,94,0.3)"
              : "1px solid var(--border)",
            borderTopRightRadius: isOwn ? 4 : undefined,
            borderTopLeftRadius: !isOwn ? 4 : undefined,
          }}
        >
          {isAuto && post.workout ? (
            <a
              href={`/workout/${post.workout.id}`}
              className="block"
            >
              <p
                className="text-[11px] mb-0.5"
                style={{
                  color: isOwn ? "var(--accent)" : "var(--fg-dim)",
                }}
              >
                🏋️ Just logged
              </p>
              <p className="text-[14px] font-semibold">
                {post.workout.title}
              </p>
            </a>
          ) : (
            <>
              {post.text && (
                <p className="text-[13px] whitespace-pre-wrap break-words">
                  {post.text}
                </p>
              )}
              {post.imageUrl && (
                <img
                  src={post.imageUrl}
                  alt=""
                  className="rounded-lg mt-1"
                  style={{
                    maxHeight: 280,
                    maxWidth: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
              {post.workout && post.text && (
                <a
                  href={`/workout/${post.workout.id}`}
                  className="block mt-2 rounded-lg px-2 py-1.5 text-[11px]"
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                  }}
                >
                  🏋️ {post.workout.title}
                </a>
              )}
            </>
          )}
        </div>

        <div
          className={`flex items-center gap-1 mt-1 px-1 ${isOwn ? "flex-row-reverse" : ""}`}
        >
          <span
            className="text-[10px] nums"
            style={{
              color: "var(--fg-dim)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {formatDistanceToNow(new Date(post.createdAt), {
              addSuffix: true,
            })}
          </span>

          <button
            onClick={() => setShowReact((v) => !v)}
            className="text-[10px] opacity-60 hover:opacity-100"
            style={{ color: "var(--fg-dim)" }}
            aria-label="React"
          >
            + react
          </button>

          <button
            onClick={() => setCommenting((v) => !v)}
            className="text-[10px] opacity-60 hover:opacity-100"
            style={{ color: "var(--fg-dim)" }}
          >
            reply
          </button>

          {isOwn && (
            <button
              onClick={remove}
              disabled={pending}
              className="text-[10px] opacity-60 hover:opacity-100"
              style={{ color: "var(--fg-dim)" }}
            >
              delete
            </button>
          )}
        </div>

        {showReact && (
          <div
            className={`mt-1 flex gap-1 ${isOwn ? "flex-row-reverse" : ""}`}
          >
            {REACTIONS.map((r) => (
              <button
                key={r}
                onClick={() => toggleReact(r)}
                className="text-[15px] w-8 h-8 rounded-full"
                style={{
                  background: myReactions.has(r)
                    ? "var(--accent-dim)"
                    : "var(--bg-elevated)",
                  border: myReactions.has(r)
                    ? "1px solid rgba(34,197,94,0.4)"
                    : "1px solid var(--border)",
                }}
              >
                {r}
              </button>
            ))}
          </div>
        )}

        {Object.keys(reactionCounts).length > 0 && (
          <div
            className={`flex gap-1 mt-1 flex-wrap ${isOwn ? "justify-end" : ""}`}
          >
            {Object.entries(reactionCounts).map(([type, count]) => {
              const mine = myReactions.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleReact(type)}
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{
                    background: mine
                      ? "var(--accent-dim)"
                      : "var(--bg-elevated)",
                    border: mine
                      ? "1px solid rgba(34,197,94,0.4)"
                      : "1px solid var(--border)",
                    color: mine ? "var(--accent)" : "var(--fg)",
                  }}
                >
                  {type}{" "}
                  <span
                    className="nums opacity-70"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {post.comments.length > 0 && (
          <div
            className={`mt-1 space-y-0.5 ${isOwn ? "items-end" : ""} flex flex-col`}
          >
            {post.comments.map((c) => (
              <p
                key={c.id}
                className="text-[11px] px-2 py-1 rounded-lg"
                style={{
                  background: "var(--bg-elevated)",
                  color: "var(--fg-muted)",
                  maxWidth: "100%",
                }}
              >
                <span
                  className="font-semibold"
                  style={{ color: "var(--fg)" }}
                >
                  {c.user.name}
                </span>{" "}
                {c.text}
              </p>
            ))}
          </div>
        )}

        {commenting && (
          <div
            className={`mt-1 flex gap-1 ${isOwn ? "flex-row-reverse" : ""} w-full`}
          >
            <input
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitComment();
              }}
              placeholder="Reply…"
              className="flex-1 rounded-lg px-2 py-1 text-[11px] focus:outline-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
            <button
              onClick={submitComment}
              disabled={pending || !commentText.trim()}
              className="btn-accent px-2 rounded-lg text-[11px]"
            >
              Send
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
