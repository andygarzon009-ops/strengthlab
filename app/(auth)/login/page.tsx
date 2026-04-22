"use client";

import { login } from "@/lib/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏋️</div>
          <h1 className="text-3xl font-bold text-white">StrengthLab</h1>
          <p className="text-zinc-400 mt-1 text-sm">Train hard. Track smarter.</p>
        </div>

        <form action={action} className="space-y-4">
          {state?.error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {state.error}
            </div>
          )}

          <div>
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div>
            <input
              name="password"
              type="password"
              placeholder="Password"
              required
              className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-base transition-colors"
          >
            {pending ? "Logging in..." : "Log In"}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          New here?{" "}
          <Link href="/signup" className="text-orange-400 hover:text-orange-300 font-medium">
            Create account
          </Link>
        </p>
      </div>
    </div>
  );
}
