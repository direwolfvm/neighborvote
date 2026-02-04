import { SubmitButton } from "@/components/submit-button";
import {
  registerMemberAction,
  resendVerificationAction
} from "@/app/register/actions";

export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const sent = params.sent === "1";
  const error = typeof params.error === "string" ? params.error : null;

  return (
    <section className="card space-y-4">
      <h1 className="text-2xl font-semibold">Member Registration</h1>
      <p className="text-sm text-slate-700">
        Register with your legal name and email address. We will send a one-time
        verification link.
      </p>

      {sent ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Verification email sent. Please check your inbox.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          {error === "invalid_input"
            ? "Please provide a valid name and email."
            : "We could not send verification email. Try again."}
        </p>
      ) : null}

      <form action={registerMemberAction} className="space-y-3">
        <label className="block text-sm">
          Full name
          <input className="field" type="text" name="fullName" required minLength={2} />
        </label>
        <label className="block text-sm">
          Email
          <input className="field" type="email" name="email" required />
        </label>
        <SubmitButton idleText="Register" pendingText="Submitting..." />
      </form>

      <details className="pt-3 text-sm">
        <summary>Resend verification link</summary>
        <form action={resendVerificationAction} className="mt-2 flex gap-2">
          <input className="field" type="email" name="email" required placeholder="you@example.com" />
          <SubmitButton
            idleText="Resend"
            pendingText="Sending..."
            className="btn h-fit whitespace-nowrap"
          />
        </form>
      </details>

      <p className="text-sm text-slate-700">
        Already verified?{" "}
        <a className="underline" href="/member/login">
          Member login
        </a>
      </p>
    </section>
  );
}
