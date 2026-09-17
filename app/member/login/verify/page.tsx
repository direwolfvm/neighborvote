import { SubmitButton } from "@/components/submit-button";
import { verifyMemberLoginAction } from "@/app/member/login/actions";

export default async function MemberLoginVerifyPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (!token) {
    return (
      <section className="card mx-auto max-w-lg space-y-2">
        <h1 className="text-2xl font-semibold">Member Login</h1>
        <p className="text-sm text-rose-700">
          This link is incomplete. Return to sign in and request a fresh email.
        </p>
      </section>
    );
  }

  return (
    <section className="card mx-auto max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold">Complete Login</h1>
      <p className="text-sm text-slate-700">
        Select the button below to finish signing in to NeighborVote.
      </p>
      <form action={verifyMemberLoginAction}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton idleText="Sign in" pendingText="Signing in..." />
      </form>
    </section>
  );
}
