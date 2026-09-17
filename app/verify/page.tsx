import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { Notice, requestErrors } from "@/components/notice";
import { verifyMemberAction } from "@/app/verify/actions";
export default async function VerifyPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" && params.token.length <= 200 ? params.token : "";
  const error = typeof params.error === "string" ? params.error : null;
  return (
    <section className="card mx-auto max-w-lg space-y-5">
      <p className="eyebrow">One last step</p>
      <h1 className="text-3xl font-semibold">Make yourself at home.</h1>
      {error && <Notice error>{requestErrors[error] || requestErrors.invalid_or_expired}</Notice>}
      {token && !error ? (
        <>
          <p className="leading-relaxed text-slate-600">
            Confirm your email to finish joining your community and see your elections.
          </p>
          <form action={verifyMemberAction}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton
              idleText="Verify my email"
              pendingText="Verifying…"
              className="btn w-full"
            />
          </form>
        </>
      ) : (
        <p className="text-slate-600">
          Open the full link from your verification email, or return to your community to request a
          new one.
        </p>
      )}
      <Link className="inline-block text-sm text-emerald-800 underline" href="/communities">
        Find your community
      </Link>
    </section>
  );
}
