"use client";

import { signup } from "@/lib/actions/auth";
import Link from "next/link";
import { useActionState } from "react";

export default function SignupPage() {
  const [state, action, pending] = useActionState(signup, undefined);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏋️</div>
          <h1 className="text-3xl font-bold text-white">Join StrengthLab</h1>
          <p className="text-zinc-400 mt-1 text-sm">Start tracking your progress</p>
        </div>

        <form action={action} className="space-y-4">
          {state?.error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm px-4 py-3 rounded-xl">
              {state.error}
            </div>
          )}

          <input
            name="name"
            type="text"
            placeholder="Your name"
            required
            className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-orange-500 transition-colors"
          />
          <input
            name="password"
            type="password"
            placeholder="Password (min 6 chars)"
            required
            minLength={6}
            className="w-full bg-zinc-900 border border-zinc-800 text-white placeholder-zinc-500 rounded-xl px-4 py-3.5 text-base focus:outline-none focus:border-orange-500 transition-colors"
          />

          <button
            type="submit"
            disabled={pending}
            className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl text-base transition-colors"
          >
            {pending ? "Creating account..." : "Create Account"}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-orange-400 hover:text-orange-300 font-medium">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
