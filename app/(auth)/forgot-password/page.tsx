"use client";

import { requestPasswordReset } from "@/lib/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

export default function ForgotPasswordPage() {
  const [state, action, pending] = useActionState(requestPasswordReset, undefined);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold tracking-tight leading-none mb-2">
            Forgot password?
          </h1>
          <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        <form action={action} className="space-y-3">
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
          {state?.success && (
            <div
              className="text-[13px] px-4 py-3 rounded-xl"
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
            <label className="label block mb-1.5">Email</label>
            <input
              name="email"
              type="email"
              required
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
            {pending ? "Sending…" : "Send reset link"}
          </button>
        </form>

        <p
          className="text-center text-[13px] mt-8"
          style={{ color: "var(--fg-muted)" }}
        >
          <Link
            href="/login"
            className="font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
