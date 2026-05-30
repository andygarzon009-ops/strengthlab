"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { searchUsers, type UserSearchResult } from "@/lib/actions/users";
import {
  sendFriendRequest,
  acceptFriendRequest,
} from "@/lib/actions/friends";
import Avatar from "@/components/Avatar";

/// Search people by @username (or name) and send a friend request without
/// leaving the page. Replaces the old paste-a-link flow.
export default function FriendSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  // Local override of a row's relationship after an action, so the button
  // updates instantly. The base state comes from the search result itself.
  const [override, setOverride] = useState<
    Map<string, "none" | "outgoing" | "incoming" | "friends">
  >(new Map());
  const [searching, startSearch] = useTransition();
  const [, startSend] = useTransition();

  const stateOf = (u: UserSearchResult) => override.get(u.id) ?? u.state;

  const onChange = (val: string) => {
    setQ(val);
    if (val.trim().length < 2) {
      setResults([]);
      return;
    }
    startSearch(async () => {
      setOverride(new Map()); // fresh results carry their own current state
      setResults(await searchUsers(val));
    });
  };

  const add = (id: string) => {
    setOverride((m) => new Map(m).set(id, "outgoing")); // optimistic
    startSend(async () => {
      const state = await sendFriendRequest(id);
      // Trust the action's real result so we never lie about success.
      setOverride((m) => new Map(m).set(id, state === "self" ? "none" : state));
      router.refresh();
    });
  };

  const accept = (id: string) => {
    setOverride((m) => new Map(m).set(id, "friends")); // optimistic
    startSend(async () => {
      await acceptFriendRequest(id);
      router.refresh();
    });
  };

  return (
    <div>
      <input
        value={q}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search @username or name"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-xl px-4 py-2.5 text-[13px] focus:outline-none"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--fg)",
        }}
      />

      {q.trim().length >= 2 && (
        <div className="mt-2 space-y-1.5">
          {searching && results.length === 0 ? (
            <p className="text-[12px] py-2" style={{ color: "var(--fg-dim)" }}>
              Searching…
            </p>
          ) : results.length === 0 ? (
            <p className="text-[12px] py-2" style={{ color: "var(--fg-dim)" }}>
              No one found. Check the spelling of their @username.
            </p>
          ) : (
            results.map((u) => (
              <div
                key={u.id}
                className="flex items-center gap-3 rounded-xl px-2.5 py-2"
                style={{ background: "var(--bg-elevated)" }}
              >
                <Link href={`/u/${u.id}`} className="shrink-0">
                  <Avatar name={u.name} image={u.image} size={36} />
                </Link>
                <Link href={`/u/${u.id}`} className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">{u.name}</p>
                  {u.username && (
                    <p className="text-[11px]" style={{ color: "var(--fg-dim)" }}>
                      @{u.username}
                    </p>
                  )}
                </Link>
                {(() => {
                  const s = stateOf(u);
                  const ghost = {
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    color: "var(--fg-dim)",
                  };
                  const accent = { background: "var(--accent)", color: "#0a0a0a" };
                  const cls =
                    "px-3 py-1.5 rounded-lg text-[12px] font-semibold shrink-0 disabled:opacity-60";
                  if (s === "friends")
                    return (
                      <span className={cls} style={ghost}>
                        ✓ Friends
                      </span>
                    );
                  if (s === "outgoing")
                    return (
                      <span className={cls} style={ghost}>
                        Requested
                      </span>
                    );
                  if (s === "incoming")
                    return (
                      <button
                        type="button"
                        onClick={() => accept(u.id)}
                        className={cls}
                        style={accent}
                      >
                        Accept
                      </button>
                    );
                  return (
                    <button
                      type="button"
                      onClick={() => add(u.id)}
                      className={cls}
                      style={accent}
                    >
                      Add
                    </button>
                  );
                })()}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
