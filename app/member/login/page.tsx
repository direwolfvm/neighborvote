import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Notice, requestErrors } from "@/components/notice";
import { requestMemberLoginAction } from "@/app/member/login/actions";
export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <section className="card mx-auto max-w-lg space-y-6">
      <p className="eyebrow">Good to see you again</p>
      <h1 className="text-3xl font-semibold tracking-tight">
        {sent ? "Check your inbox." : "Welcome back, neighbor."}
      </h1>
      <p className="leading-relaxed text-slate-600">
        Enter your verified email and we’ll send you a private sign-in link. No password needed.
      </p>
      {sent && (
        <Notice>
          If this address has access, a sign-in link is on its way. It expires in 30 minutes. Check
          your spam folder if it hasn’t arrived.
        </Notice>
      )}
      {params.logged_out && <Notice>You’ve signed out successfully.</Notice>}
      {error && (
        <Notice error>
          {requestErrors[error] || "We couldn’t complete that request. Please try again."}
        </Notice>
      )}
      <form action={requestMemberLoginAction} className="space-y-5">
        <label className="block text-sm font-medium">
          Email address
          <input
            className="field"
            type="email"
            name="email"
            autoComplete="email"
            required
            maxLength={320}
            placeholder="you@example.com"
          />
        </label>
        <SubmitButton
          idleText={sent ? "Send a fresh link" : "Email me a sign-in link"}
          pendingText="Sending your link…"
          className="btn w-full"
        />
      </form>
      <p className="text-sm text-slate-600">
        New to NeighborVote?{" "}
        <Link className="text-emerald-800 underline" href="/communities">
          Find and join your community
        </Link>
      </p>
      <Link className="inline-block text-sm text-emerald-800 underline" href="/help">
        Need help signing in?
      </Link>
    </section>
  );
}
