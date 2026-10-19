"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateProfilePhotos } from "@/lib/actions/workouts";
import { shrinkImage } from "@/lib/shrinkImage";

/// Camera button on your own profile page — tap the cover's or the avatar's
/// to swap it in place, rather than hunting for the Photos card under You.
export default function ProfilePhotoEdit({
  kind,
  hasImage,
}: {
  kind: "avatar" | "cover";
  hasImage: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (!picked) return;
    setBusy(true);
    setErr(null);
    try {
      const file = await shrinkImage(picked, kind === "cover" ? 1800 : 800);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.url) {
        setErr(body.error ?? "Upload failed");
        return;
      }
      await updateProfilePhotos(
        kind === "cover" ? { coverImage: body.url } : { image: body.url },
      );
      startTransition(() => router.refresh());
    } catch {
      setErr("Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const label =
    kind === "cover"
      ? hasImage ? "Change cover photo" : "Add cover photo"
      : hasImage ? "Change profile photo" : "Add profile photo";

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label={label}
        className={
          kind === "cover"
            ? "h-7 px-2.5 rounded-full flex items-center gap-1 text-[11px] font-semibold active:scale-95 transition-transform"
            : "w-8 h-8 rounded-full flex items-center justify-center active:scale-95 transition-transform"
        }
        style={
          kind === "cover"
            ? {
                background: "rgba(0,0,0,0.55)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                color: "#fff",
                border: "1px solid rgba(255,255,255,0.12)",
              }
            : {
                background: "linear-gradient(135deg, #4ade80, #22c55e)",
                border: "2.5px solid var(--bg)",
                boxShadow: "0 0 12px rgba(74,222,128,0.45)",
              }
        }
      >
        {busy ? (
          <span
            className="w-3.5 h-3.5 rounded-full border-2 animate-spin"
            style={{
              borderColor: kind === "cover" ? "#fff" : "#0a0a0a",
              borderTopColor: "transparent",
            }}
          />
        ) : (
          <svg
            width={kind === "cover" ? 12 : 14}
            height={kind === "cover" ? 12 : 14}
            viewBox="0 0 24 24"
            fill="none"
            stroke={kind === "cover" ? "#fff" : "#0a0a0a"}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        )}
        {kind === "cover" && (busy ? "Uploading…" : hasImage ? "Edit cover" : "Add cover")}
      </button>
      {err && (
        <span
          role="alert"
          className="absolute bottom-full mb-1 right-0 whitespace-nowrap text-[11px] font-semibold px-2 py-1 rounded-lg"
          style={{ background: "rgba(0,0,0,0.75)", color: "#fca5a5" }}
        >
          {err}
        </span>
      )}
    </>
  );
}
