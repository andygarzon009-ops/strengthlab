import Link from "next/link";
import LoginForm from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  const justReset = reset === "1";

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
              border: "1px solid rgba(34,197,94,0.25)",
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
          <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
            Log in to continue your training.
          </p>
        </div>

        {justReset && (
          <div
            className="text-[13px] px-4 py-3 rounded-xl mb-3"
            style={{
              background: "var(--accent-dim)",
              border: "1px solid rgba(34,197,94,0.25)",
              color: "var(--accent)",
            }}
          >
            Password updated. Sign in with your new password.
          </div>
        )}

        <LoginForm />

        <div className="text-center mt-4">
          <Link
            href="/forgot-password"
            className="text-[13px] font-medium"
            style={{ color: "var(--fg-muted)" }}
          >
            Forgot password?
          </Link>
        </div>

        <p
          className="text-center text-[13px] mt-6"
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
