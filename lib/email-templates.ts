import { appBaseUrl } from "@/lib/urls";

export type EmailKind =
  | "verification"
  | "member-login"
  | "admin-login"
  | "vote-link"
  | "election-open";

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!
  );
}

export function buildEmail(kind: EmailKind, url: string, electionName?: string) {
  const target = new URL(url);
  if (target.origin !== new URL(appBaseUrl()).origin)
    throw new Error("Email links must use APP_BASE_URL");
  const election = electionName || "your neighborhood election";
  const content = {
    verification: {
      subject: "One more step: verify your email",
      title: "Welcome to NeighborVote.",
      message:
        "Verify your email to finish setting up your membership. Your association determines which elections you can take part in.",
      action: "Verify my email",
      expiry: "This private link expires in 24 hours and can be used once."
    },
    "member-login": {
      subject: "Your NeighborVote sign-in link",
      title: "Your neighborhood awaits.",
      message: "Sign in to view your elections and participation history. No password to remember.",
      action: "Sign in to NeighborVote",
      expiry: "This private link expires in 30 minutes and can be used once."
    },
    "admin-login": {
      subject: "Your NeighborVote administrator sign-in link",
      title: "Ready to manage your elections?",
      message:
        "Use the button below to securely sign in to your association’s administration area.",
      action: "Sign in as administrator",
      expiry: "This private link expires in 15 minutes and can be used once."
    },
    "vote-link": {
      subject: `Your ballot: ${election}`,
      title: "Your voice matters.",
      message: `Your personal ballot for “${election}” is ready. Review your selection before submitting; your vote is final.`,
      action: "Open my ballot",
      expiry:
        "This private link expires in 2 hours or when the election closes, whichever comes first. Do not forward it."
    },
    "election-open": {
      subject: `Voting is open: ${election}`,
      title: "It’s time to have your say.",
      message: `Voting is now open for “${election}”. Visit the election page to get started.`,
      action: "View election",
      expiry: "Sign in with your verified email to request your personal voting link."
    }
  }[kind];
  const help = new URL("/help", appBaseUrl()).toString();
  const safety =
    kind === "election-open"
      ? "You received this update as an eligible member of your association."
      : "If you did not request this email, you can safely ignore it. Never share your private link.";
  const subject = content.subject.replace(/[\r\n]/g, " ").slice(0, 250);
  const text = `NeighborVote\n\n${content.title}\n\n${content.message}\n\n${content.action}: ${url}\n\n${content.expiry}\n\n${safety}\n\nNeed help? ${help}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:#f3f6f4;color:#172f28;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${escapeHtml(content.message)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:36px 16px"><table role="presentation" width="560" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px"><tr><td style="padding:0 0 24px;font-size:22px;font-weight:bold;letter-spacing:-.5px">Neighbor<span style="color:#28745a">Vote</span></td></tr><tr><td style="background:white;border:1px solid #dce6df;border-radius:16px;padding:36px 28px"><p style="font-size:12px;letter-spacing:2px;color:#28745a;font-weight:bold;margin:0 0 18px">YOUR NEIGHBORHOOD. YOUR VOICE.</p><h1 style="font-size:28px;line-height:1.25;margin:0 0 18px">${escapeHtml(content.title)}</h1><p style="font-size:16px;line-height:1.7;color:#46594f">${escapeHtml(content.message)}</p><table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0"><tr><td style="border-radius:8px;background:#205c45"><a href="${escapeHtml(url)}" style="display:inline-block;padding:16px 24px;color:white;font-size:16px;font-weight:bold;text-decoration:none">${escapeHtml(content.action)}</a></td></tr></table><p style="font-size:14px;line-height:1.6;color:#46594f">${escapeHtml(content.expiry)}</p><hr style="border:0;border-top:1px solid #e1e8e3;margin:26px 0"><p style="font-size:12px;line-height:1.7;color:#58685f">Button not working? Copy and paste this address into your browser:<br><a href="${escapeHtml(url)}" style="color:#205c45;word-break:break-all">${escapeHtml(url)}</a></p></td></tr><tr><td style="padding:24px 8px;font-size:12px;line-height:1.7;color:#58685f">${escapeHtml(safety)}<br><a href="${escapeHtml(help)}" style="color:#205c45">Get help with NeighborVote</a></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
