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
    <div className="max-w-lg mx-auto px-4 pt-6 pb-24">
      <h1 className="text-2xl font-bold text-white mb-6">Groups</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl mb-4">
          {error}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={() => { setCreating(true); setJoining(false); }}
          className="flex-1 bg-orange-500 hover:bg-orange-400 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Create Group
        </button>
        <button
          onClick={() => { setJoining(true); setCreating(false); }}
          className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          Join Group
        </button>
      </div>

      {creating && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <h3 className="text-white font-semibold mb-3">New Group</h3>
          <input
            autoFocus
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (e.g. The Crew)"
            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors mb-3"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!groupName.trim()}
              className="flex-1 bg-orange-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl"
            >
              Create
            </button>
            <button
              onClick={() => setCreating(false)}
              className="px-4 bg-zinc-800 text-zinc-400 rounded-xl"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {joining && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
          <h3 className="text-white font-semibold mb-3">Join Group</h3>
          <input
            autoFocus
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Enter invite code (e.g. ABC123)"
            className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-500 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500 transition-colors mb-3 font-mono tracking-widest"
            maxLength={6}
          />
          <div className="flex gap-2">
            <button
              onClick={handleJoin}
              disabled={joinCode.length < 6}
              className="flex-1 bg-orange-500 disabled:opacity-40 text-white font-semibold py-3 rounded-xl"
            >
              Join
            </button>
            <button
              onClick={() => setJoining(false)}
              className="px-4 bg-zinc-800 text-zinc-400 rounded-xl"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Groups list */}
      {groups.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-5xl mb-3">👥</div>
          <p className="text-zinc-400 font-medium">No groups yet</p>
          <p className="text-zinc-600 text-sm mt-1">
            Create a group and invite your friends and family.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div
              key={group.id}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="text-white font-bold text-lg">{group.name}</h3>
                  <p className="text-zinc-500 text-sm">
                    {group.members.length}{" "}
                    {group.members.length === 1 ? "member" : "members"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-zinc-500 text-xs mb-1">Invite code</p>
                  <p className="text-orange-400 font-bold font-mono tracking-widest text-lg">
                    {group.code}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {group.members.map((m) => (
                  <div
                    key={m.user.id}
                    className="flex items-center gap-1.5 bg-zinc-800 rounded-xl px-3 py-1.5"
                  >
                    <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center text-xs font-bold text-orange-400">
                      {m.user.name[0].toUpperCase()}
                    </div>
                    <span className="text-zinc-300 text-sm">{m.user.name}</span>
                    {m.role === "ADMIN" && (
                      <span className="text-xs text-orange-400">★</span>
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
