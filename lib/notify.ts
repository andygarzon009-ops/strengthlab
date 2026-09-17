import "server-only";
import { createNotification } from "@/lib/notifications";
import { sendPushToUser } from "@/lib/push";

// One way to reach a user, so there is only one way to get it wrong.
//
// The inbox row and the Web Push were two separate calls at every call site,
// which meant every new code path had to remember both. One of them shipped
// remembering neither: a re-invite returned early and the person being invited
// was never told anything at all.
//
// Both halves are best-effort by design — neither helper throws — because a
// notification that fails to send must never take down the thing it was
// announcing. The invite still exists; the log still saves.

export type Notification = {
  /// Who to tell.
  userId: string;
  /// Machine-readable kind: SESSION_INVITE, SESSION_JOIN, FRIEND_ACCEPT…
  type: string;
  /// Who caused it, when there's a person behind it.
  actorId?: string;
  /// The line in the inbox.
  body: string;
  /// Where tapping it should land.
  url?: string;
  /// The push banner. Falls back to the inbox line when a push doesn't need
  /// its own wording.
  push?: { title: string; body?: string; tag?: string };
};

export async function notify(n: Notification): Promise<void> {
  await createNotification({
    userId: n.userId,
    type: n.type,
    actorId: n.actorId,
    body: n.body,
    url: n.url,
  });

  if (n.push) {
    await sendPushToUser(n.userId, {
      title: n.push.title,
      body: n.push.body ?? n.body,
      url: n.url,
      tag: n.push.tag,
    });
  }
}
