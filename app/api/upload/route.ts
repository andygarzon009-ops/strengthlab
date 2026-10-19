import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/session";
import { NextRequest } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const userId = await requireAuth();

  // A store connected the current way authenticates over OIDC and only sets
  // BLOB_STORE_ID; older connections set a read-write token. @vercel/blob
  // handles either, so accept either.
  if (!process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID) {
    return Response.json(
      { error: "Image upload is not configured" },
      { status: 500 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return Response.json({ error: "Max image size is 8 MB" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return Response.json({ error: "Only images are allowed" }, { status: 400 });
  }

  const kindRaw = form.get("kind");
  const kind =
    kindRaw === "avatar" ? "avatars" : kindRaw === "cover" ? "covers" : "posts";

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const key = `${kind}/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
    });
    return Response.json({ url: blob.url });
  } catch (err) {
    console.error("upload failed:", err);
    return Response.json({ error: "Upload failed — try again" }, { status: 500 });
  }
}
