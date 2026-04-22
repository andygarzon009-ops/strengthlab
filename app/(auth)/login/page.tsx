"use client";

import { login } from "@/lib/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <div
            className="w-12 h-12 rounded-xl mb-6 flex items-center justify-center"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid rgba(255,90,31,0.25)",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 4h2v16H6zM16 4h2v16h-2zM3 8h3v8H3zM18 8h3v8h-3zM8 11h8v2H8z" />
            </svg>
          </div>
          <h1 className="text-[32px] font-bold tracking-tight leading-none mb-2">
            StrengthLab
          </h1>
          <p
            className="text-[14px]"
            style={{ color: "var(--fg-muted)" }}
          >
            Log in to continue your training.
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
          <div>
            <label className="label block mb-1.5">Password</label>
            <input
              name="password"
              type="password"
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
            {pending ? "Signing in…" : "Log In"}
          </button>
        </form>

        <p
          className="text-center text-[13px] mt-8"
          style={{ color: "var(--fg-muted)" }}
        >
          New here?{" "}
          <Link
            href="/signup"
            className="font-semibold"
            style={{ color: "var(--accent)" }}
          >
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
