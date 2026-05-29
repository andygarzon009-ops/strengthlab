"use client";

import { useRef, useState } from "react";
import Avatar from "@/components/Avatar";

/// Uploads to /api/upload (Vercel Blob) on file pick and hands the URL back
/// via onChange. Two shapes: a round avatar tile, or a wide cover banner.
export default function ImageUpload({
  kind,
  shape,
  value,
  name,
  onChange,
}: {
  kind: "avatar" | "cover";
  shape: "round" | "wide";
  value?: string | null;
  name: string;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("kind", kind);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const body = await res.json();
      if (!res.ok) setErr(body.error ?? "Upload failed");
      else onChange(body.url as string);
    } catch {
      setErr("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onFile}
      />

      {shape === "wide" ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="relative w-full rounded-2xl overflow-hidden flex items-center justify-center"
          style={{
            height: 120,
            background: value
              ? `center/cover url(${value})`
              : "linear-gradient(135deg, rgba(34,197,94,0.18), var(--bg-elevated))",
            border: "1px solid var(--border)",
          }}
        >
          <span
            className="text-[12px] font-semibold px-3 py-1.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.5)", color: "#fff" }}
          >
            {uploading ? "Uploading…" : value ? "Change cover" : "Add cover photo"}
          </span>
        </button>
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="relative rounded-full"
            aria-label="Change profile photo"
          >
            <Avatar name={name} image={value} size={84} />
            <span
              className="absolute bottom-0 right-0 w-7 h-7 rounded-full flex items-center justify-center"
              style={{ background: "var(--accent)", border: "2px solid var(--bg)" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#0a0a0a"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            </span>
          </button>
          <div>
            <p className="text-[13px] font-semibold">
              {uploading ? "Uploading…" : "Profile photo"}
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-[12px] mt-0.5"
              style={{ color: "var(--accent)" }}
            >
              {value ? "Change" : "Upload"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-[12px] mt-0.5 ml-3"
                style={{ color: "var(--fg-dim)" }}
              >
                Remove
              </button>
            )}
          </div>
        </div>
      )}

      {err && (
        <p className="text-[11px] mt-1.5" style={{ color: "#f87171" }}>
          {err}
        </p>
      )}
    </div>
  );
}
