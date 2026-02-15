import { appBaseUrl } from "@/lib/urls";

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

async function sendWithSendGrid(params: SendEmailParams) {
  const apiKey = requiredEnv("SENDGRID_API_KEY");
  const from = requiredEnv("MAIL_FROM");

  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: params.to }] }],
      from: { email: from },
      subject: params.subject,
      content: [
        { type: "text/plain", value: params.text },
        ...(params.html ? [{ type: "text/html", value: params.html }] : [])
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SendGrid error: ${response.status} ${body}`);
  }
}

async function sendWithMailgun(params: SendEmailParams) {
  const apiKey = requiredEnv("MAILGUN_API_KEY");
  const domain = requiredEnv("MAILGUN_DOMAIN");
  const from = requiredEnv("MAIL_FROM");
  const apiBase = process.env.MAILGUN_API_BASE_URL ?? "https://api.mailgun.net";

  const body = new URLSearchParams({
    from,
    to: params.to,
    subject: params.subject,
    text: params.text
  });

  if (params.html) {
    body.set("html", params.html);
  }

  const basicAuth = Buffer.from(`api:${apiKey}`).toString("base64");
  const response = await fetch(`${apiBase}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: body.toString()
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Mailgun error: ${response.status} ${responseBody}`);
  }
}

async function sendWithPostal(params: SendEmailParams) {
  const apiKey = requiredEnv("POSTAL_API_KEY");
  const apiBase = requiredEnv("POSTAL_API_URL");
  const from = requiredEnv("MAIL_FROM");

  const payload: Record<string, unknown> = {
    to: [params.to],
    from,
    subject: params.subject,
    plain_body: params.text
  };

  if (params.html) {
    payload.html_body = params.html;
  }

  const response = await fetch(`${apiBase}/api/v1/send/message`, {
    method: "POST",
    headers: {
      "X-Server-API-Key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`Postal error: ${response.status} ${responseBody}`);
  }
}

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const provider = (process.env.MAIL_PROVIDER ?? "postal").toLowerCase();
  if (provider === "postal") return sendWithPostal(params);
  if (provider === "mailgun") return sendWithMailgun(params);
  if (provider === "sendgrid") return sendWithSendGrid(params);

  throw new Error(`Unsupported MAIL_PROVIDER: ${provider}`);
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const verifyUrl = new URL("/verify", appBaseUrl());
  verifyUrl.searchParams.set("token", token);

  await sendEmail({
    to: email,
    subject: "Verify your NeighborVote account",
    text: `Click to verify your account: ${verifyUrl.toString()}`
  });
}
