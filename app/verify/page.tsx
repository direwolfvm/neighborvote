import { SubmitButton } from "@/components/submit-button";
import { verifyMemberAction } from "@/app/verify/actions";

export default async function VerifyPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const success = params.success === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <section className="card space-y-4">
      <h1 className="text-2xl font-semibold">Verify Membership</h1>

      {success ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Your account is verified. You can now vote in eligible elections.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          This verification link is invalid or expired. Please request a new one.
        </p>
      ) : null}

      <form action={verifyMemberAction} className="space-y-3">
        <label className="block text-sm">
          Verification token
          <input
            className="field"
            type="text"
            name="token"
            defaultValue={token}
            required
            autoComplete="off"
          />
        </label>
        <SubmitButton idleText="Verify" pendingText="Verifying..." />
      </form>
    </section>
  );
}
