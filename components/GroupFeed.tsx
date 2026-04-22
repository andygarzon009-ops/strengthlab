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

const REACTIONS = [
  "🔥",
  "💪",
  "👏",
  "🫡",
  "😂",
  "❤️",
  "💯",
  "👀",
  "🤯",
  "🙌",
];
const POLL_MS = 6000;

export default function GroupFeed({
  groupId,
  height,
}: {
  groupId: string;
  height?: string;
}) {
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
        height: height ?? 520,
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

  const timeStr = new Date(post.createdAt).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="group flex gap-2 relative">
      <div
        className="w-8 h-8 rounded-md flex items-center justify-center text-[12px] font-semibold shrink-0"
        style={{
          background: isOwn ? "var(--accent)" : "var(--accent-dim)",
          color: isOwn ? "#0a0a0a" : "var(--accent)",
        }}
      >
        {post.user.name[0]?.toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 mb-0.5">
          <span className="text-[13px] font-semibold leading-none">
            {isOwn ? "You" : post.user.name}
          </span>
          <span
            className="text-[10px] nums"
            style={{
              color: "var(--fg-dim)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {timeStr}
          </span>
          <span
            className="text-[10px]"
            style={{ color: "var(--fg-dim)" }}
          >
            · {formatDistanceToNow(new Date(post.createdAt), { addSuffix: true })}
          </span>
        </div>

        {isAuto && post.workout ? (
          <a
            href={`/workout/${post.workout.id}`}
            className="inline-block rounded-lg px-3 py-2 text-[13px]"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ color: "var(--fg-dim)" }}>🏋️ Just logged </span>
            <span className="font-semibold">{post.workout.title}</span>
          </a>
        ) : (
          <>
            {post.text && (
              <p className="text-[13px] whitespace-pre-wrap break-words leading-relaxed">
                {post.text}
              </p>
            )}
            {post.imageUrl && (
              <img
                src={post.imageUrl}
                alt=""
                className="rounded-lg mt-1.5"
                style={{
                  maxHeight: 320,
                  maxWidth: "100%",
                  objectFit: "cover",
                }}
              />
            )}
            {post.workout && post.text && (
              <a
                href={`/workout/${post.workout.id}`}
                className="inline-block mt-1.5 rounded-lg px-2.5 py-1.5 text-[11px]"
                style={{
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border)",
                }}
              >
                🏋️ {post.workout.title}
              </a>
            )}
          </>
        )}

        {(Object.keys(reactionCounts).length > 0 || showReact) && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap relative">
            {Object.entries(reactionCounts).map(([type, count]) => {
              const mine = myReactions.has(type);
              return (
                <button
                  key={type}
                  onClick={() => toggleReact(type)}
                  className="flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md"
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
                  <span className="text-[13px]">{type}</span>
                  <span
                    className="nums font-semibold"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
            <button
              onClick={() => setShowReact((v) => !v)}
              className="w-7 h-6 rounded-md flex items-center justify-center text-[11px]"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg-muted)",
              }}
              aria-label="Add reaction"
            >
              😀<span className="text-[9px] ml-0.5">+</span>
            </button>

            {showReact && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowReact(false)}
                />
                <div
                  className="absolute z-50 flex gap-0.5 rounded-full px-2 py-1.5"
                  style={{
                    top: -48,
                    left: 0,
                    background: "var(--bg-card)",
                    border: "1px solid var(--border-strong)",
                    boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                  }}
                >
                  {REACTIONS.map((r) => (
                    <button
                      key={r}
                      onClick={() => toggleReact(r)}
                      className="text-[18px] w-8 h-8 rounded-full transition-transform hover:scale-125"
                      style={{
                        background: myReactions.has(r)
                          ? "var(--accent-dim)"
                          : "transparent",
                      }}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {Object.keys(reactionCounts).length === 0 && !showReact && (
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => setShowReact(true)}
              className="text-[10px] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              style={{ color: "var(--fg-dim)" }}
            >
              😀 react
            </button>
            <button
              onClick={() => setCommenting((v) => !v)}
              className="text-[10px] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
              style={{ color: "var(--fg-dim)" }}
            >
              💬 reply
            </button>
            {isOwn && (
              <button
                onClick={remove}
                disabled={pending}
                className="text-[10px] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                style={{ color: "var(--fg-dim)" }}
              >
                delete
              </button>
            )}
          </div>
        )}

        {(Object.keys(reactionCounts).length > 0 || showReact) && (
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={() => setCommenting((v) => !v)}
              className="text-[10px]"
              style={{ color: "var(--fg-dim)" }}
            >
              💬 reply
            </button>
            {isOwn && (
              <button
                onClick={remove}
                disabled={pending}
                className="text-[10px]"
                style={{ color: "var(--fg-dim)" }}
              >
                delete
              </button>
            )}
          </div>
        )}

        {post.comments.length > 0 && (
          <div
            className="mt-2 pl-2 space-y-1"
            style={{ borderLeft: "2px solid var(--border)" }}
          >
            {post.comments.map((c) => (
              <p key={c.id} className="text-[12px] leading-snug">
                <span className="font-semibold">{c.user.name}</span>{" "}
                <span style={{ color: "var(--fg-muted)" }}>{c.text}</span>
              </p>
            ))}
          </div>
        )}

        {commenting && (
          <div className="mt-2 flex gap-1">
            <input
              autoFocus
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") submitComment();
              }}
              placeholder="Reply in thread…"
              className="flex-1 rounded-lg px-2 py-1 text-[12px] focus:outline-none"
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
