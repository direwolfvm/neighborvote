import { z } from "zod";
import { appBaseUrl } from "@/lib/urls";
import { buildEmail, type EmailKind } from "@/lib/email-templates";

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tag?: string;
}
export interface EmailReceipt {
  id: string | null;
  provider: "mailgun" | "sendgrid";
}

// Never include provider response bodies, addresses, credentials, or private links in errors.
export class MailDeliveryError extends Error {
  constructor(public readonly status: number | null) {
    super(
      status === null
        ? "Email delivery could not be confirmed"
        : `Email provider rejected request (${status})`
    );
    this.name = "MailDeliveryError";
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export async function sendEmail(params: SendEmailParams): Promise<EmailReceipt> {
  z.email().max(320).parse(params.to);
  if (/[\r\n]/.test(params.subject)) throw new Error("Invalid email subject");
  const provider = (process.env.MAIL_PROVIDER || "mailgun").toLowerCase();
  const from = requiredEnv("MAIL_FROM");
  const replyTo = process.env.MAIL_REPLY_TO;
  if (replyTo) z.email().parse(replyTo);
  let endpoint: string;
  let init: RequestInit;
  if (provider === "mailgun") {
    const apiBase = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";
    if (!["https://api.mailgun.net", "https://api.eu.mailgun.net"].includes(apiBase))
      throw new Error("Invalid Mailgun API origin");
    const domain = requiredEnv("MAILGUN_DOMAIN");
    if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error("Invalid Mailgun domain");
    const body = new FormData();
    Object.entries({
      from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      "o:tracking": "no",
      "o:tracking-clicks": "no",
      "o:tracking-opens": "no",
      "o:tag": params.tag || "neighborvote"
    }).forEach(([key, value]) => body.set(key, value));
    if (params.html) body.set("html", params.html);
    if (replyTo) body.set("h:Reply-To", replyTo);
    if (process.env.MAILGUN_TEST_MODE === "true") body.set("o:testmode", "yes");
    endpoint = `${apiBase}/v3/${domain}/messages`;
    init = {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${requiredEnv("MAILGUN_API_KEY")}`).toString("base64")}`
      },
      body
    };
  } else if (provider === "sendgrid") {
    const sender = /^(.*?)\s*<([^>]+)>$/.exec(from);
    endpoint = "https://api.sendgrid.com/v3/mail/send";
    init = {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("SENDGRID_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: params.to }] }],
        from: sender ? { name: sender[1].trim(), email: sender[2] } : { email: from },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        subject: params.subject,
        content: [
          { type: "text/plain", value: params.text },
          ...(params.html ? [{ type: "text/html", value: params.html }] : [])
        ],
        tracking_settings: {
          click_tracking: { enable: false, enable_text: false },
          open_tracking: { enable: false }
        }
      })
    };
  } else throw new Error("Unsupported MAIL_PROVIDER");

  let response: Response;
  try {
    response = await fetch(endpoint, {
      ...init,
      signal: AbortSignal.timeout(15_000),
      redirect: "error"
    });
  } catch {
    throw new MailDeliveryError(null);
  }
  if (!response.ok) throw new MailDeliveryError(response.status);
  if (provider === "sendgrid") return { provider, id: response.headers.get("x-message-id") };
  // A successful provider response is accepted even if its optional receipt cannot be read.
  const data = (await response.json().catch(() => ({}))) as { id?: string };
  return { provider, id: typeof data.id === "string" ? data.id : null };
}

export async function sendTemplatedEmail(
  to: string,
  kind: EmailKind,
  url: string,
  electionName?: string
) {
  return sendEmail({ to, ...buildEmail(kind, url, electionName), tag: `neighborvote-${kind}` });
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const url = new URL("/verify", appBaseUrl());
  url.searchParams.set("token", token);
  await sendTemplatedEmail(email, "verification", url.toString());
}
