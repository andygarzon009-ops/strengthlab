import Link from "next/link";
import ResetPasswordForm from "./reset-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="text-[32px] font-bold tracking-tight leading-none mb-2">
            Set a new password
          </h1>
          <p className="text-[14px]" style={{ color: "var(--fg-muted)" }}>
            Choose a password you&apos;ll remember.
          </p>
        </div>

        {token ? (
          <ResetPasswordForm token={token} />
        ) : (
          <div
            className="text-[13px] px-4 py-3 rounded-xl"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              color: "#f87171",
            }}
          >
            Missing reset token. Request a new link from{" "}
            <Link
              href="/forgot-password"
              className="font-semibold underline"
            >
              Forgot password
            </Link>
            .
          </div>
        )}

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
