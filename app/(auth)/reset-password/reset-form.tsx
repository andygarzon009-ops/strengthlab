"use client";

import { resetPassword } from "@/lib/actions/auth";
import { useActionState } from "react";

export default function ResetPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(resetPassword, undefined);

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />

      {state?.error && (
        <div
          className="text-[13px] px-4 py-3 rounded-xl"
          style={{
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171",
          }}
        >
          {state.error}
        </div>
      )}

      <div>
        <label className="label block mb-1.5">New password</label>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          className="w-full rounded-xl px-4 py-3.5 text-[15px] focus:outline-none transition-colors"
          style={{
            background: "var(--bg-card)",
            border: "1px solid var(--border)",
            color: "var(--fg)",
          }}
        />
      </div>
      <div>
        <label className="label block mb-1.5">Confirm password</label>
        <input
          name="confirm"
          type="password"
          required
          minLength={6}
          className="w-full rounded-xl px-4 py-3.5 text-[15px] focus:outline-none transition-colors"
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
        className="btn-accent w-full py-3.5 rounded-xl text-[15px] mt-2"
      >
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
