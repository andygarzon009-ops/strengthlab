import "server-only";
import { prisma } from "@/lib/db";

/// Record a persistent in-app notification for a recipient. Fully defensive:
/// a write failure must never break the calling action (the inbox is a
/// best-effort convenience on top of Web Push). Push delivery is handled
/// separately by sendPushToUser.
export async function createNotification(input: {
  userId: string; // recipient
  type: string; // e.g. FRIEND_ACCEPT
  body: string;
  actorId?: string;
  url?: string;
}): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        body: input.body,
        actorId: input.actorId ?? null,
        url: input.url ?? null,
      },
    });
  } catch {
    // Swallow — a failed inbox write must not surface to the user.
  }
}
