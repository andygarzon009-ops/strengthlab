"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUsername } from "@/lib/actions/users";
import { normalizeUsername, validateUsername } from "@/lib/username";

/// Claim or change your @username. Saves on its own (separate from the main
/// profile form) so the uniqueness check has a clear success/error state.
export default function UsernameField({ initial }: { initial: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [saved, setSaved] = useState<string | null>(initial);
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const normalized = normalizeUsername(value);
  const dirty = normalized !== (saved ?? "");
  const localError = value ? validateUsername(value) : null;

  const save = () => {
    setMsg(null);
    if (localError) {
      setMsg({ error: localError });
      return;
    }
    startTransition(async () => {
      const res = await setUsername(value);
      if (res.error) {
        setMsg({ error: res.error });
      } else {
        setSaved(normalized);
        setValue(normalized);
        setMsg({ ok: "Username saved" });
        router.refresh();
        setTimeout(() => setMsg(null), 1800);
      }
    });
  };

  return (
    <div>
      <label className="label block mb-1.5">Username</label>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <span
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[15px]"
            style={{ color: "var(--fg-dim)" }}
          >
            @
          </span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="username"
            className="w-full rounded-xl pl-7 pr-4 py-3 text-[15px] focus:outline-none"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              color: "var(--fg)",
            }}
          />
        </div>
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty || !!localError}
          className="btn-accent px-5 rounded-xl text-[14px] disabled:opacity-50"
        >
          {pending ? "…" : "Save"}
        </button>
      </div>
      {msg?.error ? (
        <p className="text-[11px] mt-1" style={{ color: "#f87171" }}>
          {msg.error}
        </p>
      ) : msg?.ok ? (
        <p className="text-[11px] mt-1" style={{ color: "var(--accent)" }}>
          {msg.ok}
        </p>
      ) : (
        <p className="text-[11px] mt-1" style={{ color: "var(--fg-dim)" }}>
          Friends find you by @username. Letters, numbers, underscores.
        </p>
      )}
    </div>
  );
}
