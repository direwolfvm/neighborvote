import { appBaseUrl } from "@/lib/urls";

interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

async function sendWithSendGrid(params: SendEmailParams) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const from = process.env.MAIL_FROM;

  if (!apiKey || !from) {
    throw new Error("SENDGRID_API_KEY and MAIL_FROM are required");
  }

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

export async function sendEmail(params: SendEmailParams): Promise<void> {
  const provider = (process.env.MAIL_PROVIDER ?? "sendgrid").toLowerCase();
  if (provider === "sendgrid") {
    await sendWithSendGrid(params);
    return;
  }

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
