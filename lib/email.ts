import "server-only";

type EmailInput = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export async function sendEmail({ to, subject, text, html }: EmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "StrengthLab <onboarding@resend.dev>";

  if (!apiKey) {
    console.log(
      `[email:dev] No RESEND_API_KEY set — would have sent email:\n` +
        `  to: ${to}\n  subject: ${subject}\n${text}\n`
    );
    return { ok: true, dev: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error("[email] Resend failed", res.status, body);
    return { ok: false, error: body };
  }
  return { ok: true };
}
