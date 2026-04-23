"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addPostComment,
  createGroupPost,
  deleteGroupPost,
  togglePostReaction,
} from "@/lib/actions/posts";
import {
  createChallenge,
  createCompareCard,
  joinChallenge,
  leaveChallenge,
  type ChallengeType,
} from "@/lib/actions/challenges";
import { format, formatDistanceToNow } from "date-fns";

type Exercise = { id: string; name: string };
type Member = { user: { id: string; name: string } };

type ChallengeData = {
  id: string;
  type: string;
  targetValue: number;
  targetReps: number | null;
  deadline: string | null;
  resolved: boolean;
  creatorId: string;
  exercise: { id: string; name: string } | null;
  participants: { userId: string; user: { id: string; name: string } }[];
};

type CompareData = {
  exerciseId: string;
  exerciseName: string;
  me: PartySnapshot;
  them: PartySnapshot;
};

type PartySnapshot = {
  id: string;
  name: string;
  pr: { weight: number; reps: number; date: string } | null;
  lastTopSets: { date: string; weight: number; reps: number }[];
};

type Post = {
  id: string;
  text: string;
  imageUrl: string | null;
  workoutId: string | null;
  cardType: string | null;
  cardData: CompareData | null;
  challengeId: string | null;
  createdAt: string;
  user: { id: string; name: string };
  workout: {
    id: string;
    title: string;
    type: string;
    date: string;
  } | null;
  challenge: ChallengeData | null;
  challengeProgress:
    | { userId: string; userName: string; current: number; hit: boolean }[]
    | null;
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
  const [members, setMembers] = useState<Member[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
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
    // Fetch group members and exercises once for the composer modals
    fetch("/api/groups")
      .then((r) => r.json())
      .then((groups) => {
        const g = Array.isArray(groups)
          ? groups.find((gg: { id: string }) => gg.id === groupId)
          : null;
        if (g?.members) setMembers(g.members);
      })
      .catch(() => {});
    fetch("/api/exercises")
      .then((r) => r.json())
      .then(setExercises)
      .catch(() => {});
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
        minHeight: 360,
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

      <Composer
        groupId={groupId}
        currentUserId={data.currentUserId}
        members={members}
        exercises={exercises}
        onSent={() => load(true)}
      />
    </div>
  );
}

function Composer({
  groupId,
  currentUserId,
  members,
  exercises,
  onSent,
}: {
  groupId: string;
  currentUserId: string;
  members: Member[];
  exercises: Exercise[];
  onSent: () => void;
}) {
  const [text, setText] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [showChallenge, setShowChallenge] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
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
        <button
          type="button"
          onClick={() => setShowChallenge(true)}
          className="shrink-0 w-9 h-9 rounded-lg text-[15px] flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
          aria-label="Start challenge"
        >
          ⚔️
        </button>
        <button
          type="button"
          onClick={() => setShowCompare(true)}
          className="shrink-0 w-9 h-9 rounded-lg text-[15px] flex items-center justify-center"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
          }}
          aria-label="Compare"
        >
          📊
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

      {showChallenge && (
        <ChallengeModal
          groupId={groupId}
          exercises={exercises}
          onClose={() => setShowChallenge(false)}
          onCreated={() => {
            setShowChallenge(false);
            onSent();
          }}
        />
      )}
      {showCompare && (
        <CompareModal
          groupId={groupId}
          currentUserId={currentUserId}
          members={members}
          exercises={exercises}
          onClose={() => setShowCompare(false)}
          onCreated={() => {
            setShowCompare(false);
            onSent();
          }}
        />
      )}
    </div>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card p-5 w-full max-w-md animate-slide-up"
        style={{ marginBottom: "max(1rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[16px] font-bold tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="text-[12px] label"
            style={{ color: "var(--fg-dim)" }}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ChallengeModal({
  groupId,
  exercises,
  onClose,
  onCreated,
}: {
  groupId: string;
  exercises: Exercise[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<ChallengeType>("LIFT");
  const [exerciseId, setExerciseId] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [targetReps, setTargetReps] = useState("");
  const [deadline, setDeadline] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError("");
    const target = parseFloat(targetValue);
    if (!target || target <= 0) {
      setError("Target must be a positive number.");
      return;
    }
    if (type === "LIFT" && !exerciseId) {
      setError("Pick an exercise.");
      return;
    }
    const reps = parseInt(targetReps);
    startTransition(async () => {
      const res = await createChallenge({
        groupId,
        type,
        exerciseId: type === "LIFT" ? exerciseId : undefined,
        targetValue: target,
        targetReps: type === "LIFT" && reps > 0 ? reps : undefined,
        deadline: deadline || undefined,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      onCreated();
    });
  };

  return (
    <ModalShell title="⚔️ Start a challenge" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <p className="label mb-1.5">Type</p>
          <div className="grid grid-cols-2 gap-1.5">
            {(
              [
                { v: "LIFT", l: "Lift PR" },
                { v: "SESSIONS_WEEK", l: "Sessions/wk" },
              ] as { v: ChallengeType; l: string }[]
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setType(o.v)}
                className="text-[11px] py-2 rounded-lg label"
                style={
                  type === o.v
                    ? {
                        background: "var(--accent-dim)",
                        color: "var(--accent)",
                        border: "1px solid rgba(34,197,94,0.4)",
                      }
                    : {
                        background: "var(--bg-elevated)",
                        color: "var(--fg-muted)",
                        border: "1px solid var(--border)",
                      }
                }
              >
                {o.l}
              </button>
            ))}
          </div>
        </div>

        {type === "LIFT" && (
          <div>
            <p className="label mb-1.5">Exercise</p>
            <select
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-[13px] focus:outline-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            >
              <option value="">— pick —</option>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <p className="label mb-1.5">
            {type === "LIFT" ? "Target weight (lb)" : "Target sessions"}
          </p>
          <input
            type="number"
            inputMode="decimal"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder={type === "LIFT" ? "315" : "5"}
            className="w-full rounded-lg px-3 py-2.5 text-[13px] nums focus:outline-none"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-geist-mono)",
            }}
          />
        </div>

        {type === "LIFT" && (
          <div>
            <p className="label mb-1.5">Min reps (optional)</p>
            <input
              type="number"
              inputMode="numeric"
              value={targetReps}
              onChange={(e) => setTargetReps(e.target.value)}
              placeholder="5"
              className="w-full rounded-lg px-3 py-2.5 text-[13px] nums focus:outline-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
                fontFamily: "var(--font-geist-mono)",
              }}
            />
          </div>
        )}

        <div>
          <p className="label mb-1.5">Deadline (optional)</p>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg px-3 py-2.5 text-[13px] nums focus:outline-none"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-geist-mono)",
              colorScheme: "dark",
            }}
          />
        </div>

        {error && (
          <p className="text-[12px]" style={{ color: "#f87171" }}>
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={pending}
          className="btn-accent w-full py-2.5 rounded-lg text-[13px]"
        >
          {pending ? "Posting…" : "Post challenge"}
        </button>
      </div>
    </ModalShell>
  );
}

function CompareModal({
  groupId,
  currentUserId,
  members,
  exercises,
  onClose,
  onCreated,
}: {
  groupId: string;
  currentUserId: string;
  members: Member[];
  exercises: Exercise[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const others = members.filter((m) => m.user.id !== currentUserId);
  const [otherId, setOtherId] = useState(others[0]?.user.id ?? "");
  const [exerciseId, setExerciseId] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError("");
    if (!otherId || !exerciseId) {
      setError("Pick an athlete and a lift.");
      return;
    }
    startTransition(async () => {
      const res = await createCompareCard({
        groupId,
        otherUserId: otherId,
        exerciseId,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      onCreated();
    });
  };

  return (
    <ModalShell title="📊 Compare with a crew member" onClose={onClose}>
      {others.length === 0 ? (
        <p
          className="text-[12px] py-2"
          style={{ color: "var(--fg-muted)" }}
        >
          No one else is in this crew yet.
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="label mb-1.5">Athlete</p>
            <select
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-[13px] focus:outline-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            >
              {others.map((m) => (
                <option key={m.user.id} value={m.user.id}>
                  {m.user.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="label mb-1.5">Exercise</p>
            <select
              value={exerciseId}
              onChange={(e) => setExerciseId(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-[13px] focus:outline-none"
              style={{
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            >
              <option value="">— pick —</option>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <p className="text-[12px]" style={{ color: "#f87171" }}>
              {error}
            </p>
          )}

          <button
            onClick={submit}
            disabled={pending}
            className="btn-accent w-full py-2.5 rounded-lg text-[13px]"
          >
            {pending ? "Posting…" : "Post comparison"}
          </button>
        </div>
      )}
    </ModalShell>
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

        {post.cardType === "CHALLENGE" && post.challenge ? (
          <ChallengeCard
            challenge={post.challenge}
            progress={post.challengeProgress ?? []}
            currentUserId={currentUserId}
            onChanged={onChanged}
          />
        ) : post.cardType === "COMPARE" && post.cardData ? (
          <CompareCard data={post.cardData} />
        ) : isAuto && post.workout ? (
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

function ChallengeCard({
  challenge,
  progress,
  currentUserId,
  onChanged,
}: {
  challenge: ChallengeData;
  progress: { userId: string; userName: string; current: number; hit: boolean }[];
  currentUserId: string;
  onChanged: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const joined = challenge.participants.some(
    (p) => p.userId === currentUserId
  );
  const typeLabel =
    challenge.type === "LIFT" ? "Lift PR" : "Sessions this week";
  const targetStr =
    challenge.type === "LIFT"
      ? `${challenge.exercise?.name ?? "Lift"} — ${challenge.targetValue}lb${challenge.targetReps ? ` × ${challenge.targetReps}` : ""}`
      : `${challenge.targetValue} sessions / week`;
  const maxCurrent = Math.max(
    challenge.targetValue,
    ...progress.map((p) => p.current)
  );

  const toggle = () => {
    startTransition(async () => {
      if (joined) {
        await leaveChallenge(challenge.id);
      } else {
        await joinChallenge(challenge.id);
      }
      onChanged();
    });
  };

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background:
          "linear-gradient(135deg, rgba(34,197,94,0.08) 0%, var(--bg-elevated) 70%)",
        border: "1px solid rgba(34,197,94,0.3)",
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <p
            className="label text-[9px]"
            style={{ color: "var(--accent)" }}
          >
            ⚔️ {typeLabel} challenge
          </p>
          <p className="text-[14px] font-semibold mt-0.5 truncate">
            {targetStr}
          </p>
          {challenge.deadline && (
            <p
              className="text-[10px] nums mt-0.5"
              style={{
                color: "var(--fg-dim)",
                fontFamily: "var(--font-geist-mono)",
              }}
            >
              By {format(new Date(challenge.deadline), "MMM d, yyyy")}
            </p>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={pending}
          className="shrink-0 text-[11px] px-3 py-1.5 rounded-lg label"
          style={
            joined
              ? {
                  background: "var(--bg-card)",
                  border: "1px solid var(--border)",
                  color: "var(--fg-muted)",
                }
              : {
                  background: "var(--accent)",
                  color: "#0a0a0a",
                  border: "1px solid var(--accent)",
                }
          }
        >
          {joined ? "Leave" : "I'm in"}
        </button>
      </div>

      {progress.length > 0 ? (
        <div className="space-y-1.5 mt-2">
          {progress.map((p) => {
            const pct = Math.min(
              100,
              maxCurrent > 0 ? (p.current / challenge.targetValue) * 100 : 0
            );
            return (
              <div key={p.userId}>
                <div className="flex items-center justify-between text-[11px] mb-0.5">
                  <span className="flex items-center gap-1">
                    {p.hit && <span>✅</span>}
                    <span className="font-medium">{p.userName}</span>
                  </span>
                  <span
                    className="nums"
                    style={{
                      fontFamily: "var(--font-geist-mono)",
                      color: p.hit ? "var(--accent)" : "var(--fg-dim)",
                    }}
                  >
                    {p.current.toLocaleString()}
                    <span
                      className="opacity-60"
                      style={{ color: "var(--fg-dim)" }}
                    >
                      {" "}
                      / {challenge.targetValue.toLocaleString()}
                    </span>
                  </span>
                </div>
                <div
                  className="h-1.5 rounded-full overflow-hidden"
                  style={{ background: "var(--bg-card)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: p.hit
                        ? "var(--accent)"
                        : "var(--fg-muted)",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p
          className="text-[11px] mt-2"
          style={{ color: "var(--fg-muted)" }}
        >
          No one has joined yet. Tap "I&apos;m in" to enter.
        </p>
      )}
    </div>
  );
}

function CompareCard({ data }: { data: CompareData }) {
  const renderSide = (p: PartySnapshot, align: "left" | "right") => (
    <div className={align === "right" ? "text-right" : ""}>
      <p
        className="text-[11px] font-semibold truncate"
        style={{ color: "var(--fg)" }}
      >
        {p.name}
      </p>
      {p.pr ? (
        <p
          className="nums text-[18px] font-bold mt-0.5"
          style={{
            fontFamily: "var(--font-geist-mono)",
            color: "var(--accent)",
          }}
        >
          {p.pr.weight}
          <span className="text-[10px] font-normal opacity-70 ml-0.5">
            lb × {p.pr.reps}
          </span>
        </p>
      ) : (
        <p
          className="text-[11px] mt-0.5"
          style={{ color: "var(--fg-dim)" }}
        >
          No PR yet
        </p>
      )}
      <div className="mt-1 space-y-0.5">
        {p.lastTopSets.map((s, i) => (
          <p
            key={i}
            className="text-[10px] nums"
            style={{
              color: "var(--fg-dim)",
              fontFamily: "var(--font-geist-mono)",
            }}
          >
            {format(new Date(s.date), "MMM d")}: {s.weight}×{s.reps}
          </p>
        ))}
        {p.lastTopSets.length === 0 && (
          <p className="text-[10px]" style={{ color: "var(--fg-dim)" }}>
            No sessions logged
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
      }}
    >
      <p
        className="label text-[9px] mb-2"
        style={{ color: "var(--fg-dim)" }}
      >
        📊 {data.exerciseName}
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
        {renderSide(data.me, "left")}
        <div
          className="text-[11px] py-3 px-1"
          style={{ color: "var(--fg-dim)" }}
        >
          vs
        </div>
        {renderSide(data.them, "right")}
      </div>
    </div>
  );
}
