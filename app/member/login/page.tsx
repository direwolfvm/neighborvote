import { SubmitButton } from "@/components/submit-button";
import { requestMemberLoginAction } from "@/app/member/login/actions";

export default async function MemberLoginPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const loggedOut = params.logged_out === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <section className="card space-y-4">
      <h1 className="text-2xl font-semibold">Member Login</h1>
      <p className="text-sm text-slate-700">Request a one-time login link.</p>

      {sent ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          If the email is registered and verified, a login link has been sent.
        </p>
      ) : null}

      {loggedOut ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">You are logged out.</p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          {error === "invalid_email" ? "Enter a valid email." : null}
          {error === "invalid_token" ? "Login token is invalid." : null}
          {error === "invalid_or_expired" ? "Login token expired or already used." : null}
          {!['invalid_email', 'invalid_token', 'invalid_or_expired'].includes(error)
            ? "Login request failed."
            : null}
        </p>
      ) : null}

      <form action={requestMemberLoginAction} className="space-y-3">
        <label className="block text-sm">
          Email
          <input className="field" type="email" name="email" required />
        </label>
        <SubmitButton idleText="Send login link" pendingText="Sending..." />
      </form>
    </section>
  );
}
