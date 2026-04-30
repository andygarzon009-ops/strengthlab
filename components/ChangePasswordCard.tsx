"use client";

import { changePassword } from "@/lib/actions/auth";
import { useActionState, useEffect, useRef, useState } from "react";

export default function ChangePasswordCard() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(changePassword, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <div className="card px-4 py-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "var(--bg-elevated)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--fg-muted)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="4" y="11" width="16" height="9" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </div>
          <span className="font-medium text-[14px]">Change password</span>
        </div>
        <span style={{ color: "var(--fg-dim)" }}>{open ? "−" : "→"}</span>
      </button>

      {open && (
        <form ref={formRef} action={action} className="space-y-3 mt-4">
          {state?.error && (
            <div
              className="text-[13px] px-3 py-2 rounded-lg"
              style={{
                background: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.25)",
                color: "#f87171",
              }}
            >
              {state.error}
            </div>
          )}
          {state?.success && (
            <div
              className="text-[13px] px-3 py-2 rounded-lg"
              style={{
                background: "var(--accent-dim)",
                border: "1px solid rgba(34,197,94,0.25)",
                color: "var(--accent)",
              }}
            >
              {state.success}
            </div>
          )}

          <div>
            <label className="label block mb-1.5">Current password</label>
            <input
              name="currentPassword"
              type="password"
              required
              className="w-full rounded-xl px-3 py-3 text-[14px] focus:outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>
          <div>
            <label className="label block mb-1.5">New password</label>
            <input
              name="newPassword"
              type="password"
              required
              minLength={6}
              className="w-full rounded-xl px-3 py-3 text-[14px] focus:outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>
          <div>
            <label className="label block mb-1.5">Confirm new password</label>
            <input
              name="confirm"
              type="password"
              required
              minLength={6}
              className="w-full rounded-xl px-3 py-3 text-[14px] focus:outline-none"
              style={{
                background: "var(--bg-card)",
                border: "1px solid var(--border)",
                color: "var(--fg)",
              }}
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="btn-accent w-full py-3 rounded-xl text-[14px]"
          >
            {pending ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
    </div>
  );
}
