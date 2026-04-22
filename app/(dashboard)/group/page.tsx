"use client";

import { createGroup, joinGroup } from "@/lib/actions/workouts";
import { useState, useEffect, useTransition } from "react";

type Group = {
  id: string;
  name: string;
  code: string;
  members: { user: { name: string; id: string }; role: string }[];
};

export default function GroupPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [error, setError] = useState("");
  const [, startTransition] = useTransition();

  useEffect(() => {
    fetch("/api/groups")
      .then((r) => r.json())
      .then(setGroups);
  }, []);

  const handleCreate = () => {
    if (!groupName.trim()) return;
    setError("");
    startTransition(async () => {
      await createGroup(groupName);
      const res = await fetch("/api/groups");
      setGroups(await res.json());
      setGroupName("");
      setCreating(false);
    });
  };

  const handleJoin = () => {
    if (!joinCode.trim()) return;
    setError("");
    startTransition(async () => {
      const result = await joinGroup(joinCode.toUpperCase());
      if (result?.error) {
        setError(result.error);
      } else {
        const res = await fetch("/api/groups");
        setGroups(await res.json());
        setJoinCode("");
        setJoining(false);
      }
    });
  };

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-24">
      <div className="mb-8">
        <p className="label">Crew</p>
        <h1 className="text-[28px] font-bold tracking-tight leading-none mt-1">
          Train together
        </h1>
      </div>

      {error && (
        <div
          className="text-[13px] px-4 py-3 rounded-xl mb-4"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => {
            setCreating(true);
            setJoining(false);
          }}
          className="btn-accent flex-1 py-3 rounded-xl text-[14px]"
        >
          Create
        </button>
        <button
          onClick={() => {
            setJoining(true);
            setCreating(false);
          }}
          className="btn-ghost flex-1 py-3 rounded-xl text-[14px]"
        >
          Join
        </button>
      </div>

      {creating && (
        <div className="card p-4 mb-4">
          <p className="label mb-2">New crew</p>
          <input
            autoFocus
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="e.g. The Iron Club"
            className="w-full rounded-xl px-4 py-3 text-[14px] focus:outline-none mb-3"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!groupName.trim()}
              className="btn-accent flex-1 py-3 rounded-xl text-[14px]"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="btn-ghost px-5 rounded-xl text-[14px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {joining && (
        <div className="card p-4 mb-4">
          <p className="label mb-2">Join with code</p>
          <input
            autoFocus
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={6}
            className="w-full rounded-xl px-4 py-3 text-[16px] focus:outline-none mb-3 font-mono tracking-[0.3em] text-center"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
              fontFamily: "var(--font-geist-mono)",
            }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleJoin}
              disabled={joinCode.length < 6}
              className="btn-accent flex-1 py-3 rounded-xl text-[14px]"
            >
              Join
            </button>
            <button
              onClick={() => setJoining(false)}
              className="btn-ghost px-5 rounded-xl text-[14px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="text-center py-16 card">
          <p className="font-medium text-[14px]">No crew yet</p>
          <p
            className="text-[12px] mt-1.5"
            style={{ color: "var(--fg-muted)" }}
          >
            Create one and invite your friends.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group) => (
            <div key={group.id} className="card p-5">
              <div className="flex items-start justify-between mb-4 gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-[17px] tracking-tight truncate">
                    {group.name}
                  </h3>
                  <p
                    className="text-[11px] mt-0.5 nums"
                    style={{
                      color: "var(--fg-dim)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {group.members.length}{" "}
                    {group.members.length === 1 ? "member" : "members"}
                  </p>
                </div>
                <div
                  className="text-right shrink-0 px-3 py-2 rounded-lg"
                  style={{ background: "var(--bg-elevated)" }}
                >
                  <p
                    className="label text-[9px] mb-0.5"
                    style={{ color: "var(--fg-dim)" }}
                  >
                    Code
                  </p>
                  <p
                    className="font-bold tracking-[0.2em] text-[15px] nums"
                    style={{
                      color: "var(--accent)",
                      fontFamily: "var(--font-geist-mono)",
                    }}
                  >
                    {group.code}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {group.members.map((m) => (
                  <div
                    key={m.user.id}
                    className="flex items-center gap-1.5 rounded-full px-2.5 py-1"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold"
                      style={{
                        background: "var(--accent-dim)",
                        color: "var(--accent)",
                      }}
                    >
                      {m.user.name[0].toUpperCase()}
                    </div>
                    <span
                      className="text-[12px]"
                      style={{ color: "var(--fg)" }}
                    >
                      {m.user.name}
                    </span>
                    {m.role === "ADMIN" && (
                      <span
                        className="text-[9px]"
                        style={{ color: "var(--accent)" }}
                      >
                        ★
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
