// Shared shell for the public Privacy Policy and Terms pages. These sit
// outside (dashboard) so they render without a session — Google's OAuth
// consent screen links to them and reviewers open them logged out.

import Link from "next/link";
import Wordmark from "@/components/Wordmark";

export default function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <main
      className="min-h-screen px-5 py-12"
      style={{ background: "var(--bg)" }}
    >
      <article className="mx-auto max-w-2xl text-[15px] leading-relaxed text-neutral-300 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-white [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mb-1 [&_a]:underline">
        <Link href="/login" aria-label="StrengthLab home">
          <Wordmark size={24} />
        </Link>
        <h1 className="mt-8 text-3xl font-bold text-white">{title}</h1>
        <p className="text-sm text-neutral-500">Last updated {updated}</p>
        {children}
        <p className="mt-10 text-sm text-neutral-500">
          <Link href="/privacy">Privacy Policy</Link> ·{" "}
          <Link href="/terms">Terms of Service</Link>
        </p>
      </article>
    </main>
  );
}
