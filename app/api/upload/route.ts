import { put } from "@vercel/blob";
import { requireAuth } from "@/lib/session";
import { NextRequest } from "next/server";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const userId = await requireAuth();

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
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

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const key = `posts/${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const blob = await put(key, file, {
    access: "public",
    contentType: file.type,
  });

  return Response.json({ url: blob.url });
}
