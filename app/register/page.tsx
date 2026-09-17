import Link from "next/link";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Notice, requestErrors } from "@/components/notice";
import { registerMemberAction, resendVerificationAction } from "@/app/register/actions";
import { getCommunityBySlug } from "@/lib/community";
import { communityRulesSchema } from "@/lib/community-rules";
export default async function RegisterPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  if (typeof params.community !== "string") redirect("/communities");
  const community = await getCommunityBySlug(params.community);
  if (!community) redirect("/communities");
  const rules = communityRulesSchema.parse(community.rulesJson);
  const error = typeof params.error === "string" ? params.error : null;
  const sent = params.sent === "1";
  return (
    <section className="mx-auto grid max-w-4xl gap-8 md:grid-cols-[1fr_1.3fr]">
      <aside className="space-y-5 pt-3">
        <Link
          href={`/communities/${community.slug}`}
          className="text-sm text-emerald-800 underline"
        >
          ← {community.name}
        </Link>
        <p className="eyebrow pt-4">You belong in the conversation</p>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight">
          Let’s get you
          <br />
          connected.
        </h1>
        <p className="leading-relaxed text-slate-600">
          Join {community.name} with your name and email. We trust our neighbors to provide accurate
          details.
        </p>
        <p className="text-sm leading-relaxed text-slate-600">
          Meet the conditions, verify your email, and you’re ready. There’s no manual approval step.
        </p>
        {community.contactEmail && (
          <a
            className="inline-block text-sm text-emerald-800 underline"
            href={`mailto:${community.contactEmail}`}
          >
            Questions? Contact your community manager
          </a>
        )}
      </aside>
      <div className="card space-y-5">
        {sent ? (
          <>
            <p className="eyebrow">Check your inbox</p>
            <h2 className="text-2xl font-semibold">Your next step is in your email.</h2>
            <Notice>
              If your details qualify, we’ve sent a private verification link. It expires in 24
              hours. Open it and select “Verify my email” to finish joining.
            </Notice>
            <p className="text-sm text-slate-600">
              Look for NeighborVote from no-reply@neighborvote.online. Check spam or junk if it
              hasn’t arrived. Existing members can also{" "}
              <Link href="/member/login" className="underline">
                sign in
              </Link>
              .
            </p>
          </>
        ) : (
          <h2 className="text-xl font-semibold">Join {community.name}</h2>
        )}
        {error && (
          <Notice error>
            {error === "not_eligible"
              ? typeof params.reason === "string"
                ? params.reason.slice(0, 300)
                : "Your details do not meet this community’s conditions."
              : requestErrors[error] || "We couldn’t complete your registration. Please try again."}
          </Notice>
        )}
        {!rules.registrationOpen ? (
          <Notice>Registration is currently closed. Please contact your community manager.</Notice>
        ) : (
          !sent && (
            <form action={registerMemberAction} className="space-y-4">
              <input type="hidden" name="community" value={community.slug} />
              <label className="block text-sm font-medium">
                Full name
                <input
                  className="field"
                  type="text"
                  name="fullName"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={200}
                />
              </label>
              <label className="block text-sm font-medium">
                Email address
                <input
                  className="field"
                  type="email"
                  name="email"
                  autoComplete="email"
                  required
                  maxLength={320}
                />
              </label>
              {rules.boundary && (
                <>
                  <p className="text-sm leading-relaxed text-slate-600">
                    Your community uses an address boundary check. Your address is sent to the US
                    Census geocoder to check its approximate location; this is not proof of
                    residency.
                  </p>
                  <label className="block text-sm font-medium">
                    Street address
                    <input
                      className="field"
                      name="street"
                      autoComplete="address-line1"
                      required
                      maxLength={100}
                    />
                  </label>
                  <div className="grid grid-cols-[1fr_5rem] gap-3">
                    <label className="text-sm font-medium">
                      City
                      <input
                        className="field"
                        name="city"
                        autoComplete="address-level2"
                        required
                        maxLength={100}
                      />
                    </label>
                    <label className="text-sm font-medium">
                      State
                      <input
                        className="field"
                        name="state"
                        autoComplete="address-level1"
                        required
                        pattern="[A-Za-z]{2}"
                        maxLength={2}
                        placeholder="VA"
                      />
                    </label>
                  </div>
                </>
              )}
              {(rules.boundary || rules.allowedPostalCodes.length > 0) && (
                <label className="block text-sm font-medium">
                  {rules.boundary ? "ZIP code" : "Postal code"}
                  <input
                    className="field"
                    name="postalCode"
                    autoComplete="postal-code"
                    required
                    maxLength={20}
                  />
                  {rules.allowedPostalCodes.length > 0 && (
                    <span className="mt-2 block text-xs font-normal text-slate-500">
                      Eligible postal codes: {rules.allowedPostalCodes.join(", ")}
                    </span>
                  )}
                </label>
              )}
              {rules.requiredAttestations.length > 0 && (
                <fieldset className="space-y-3 border-t pt-4">
                  <legend className="text-sm font-semibold">Community membership statements</legend>
                  {rules.requiredAttestations.map((item) => (
                    <label key={item.id} className="flex items-start gap-3 text-sm leading-relaxed">
                      <input
                        type="checkbox"
                        name="attestations"
                        value={item.id}
                        required
                        className="mt-1"
                      />
                      {item.label}
                    </label>
                  ))}
                </fieldset>
              )}
              <SubmitButton
                idleText="Join & verify my email"
                pendingText={rules.boundary ? "Checking address…" : "Sending your link…"}
                className="btn w-full"
              />
              <p className="text-xs leading-relaxed text-slate-500">
                We use your details for membership and voting.{" "}
                <Link className="underline" href="/help">
                  How your information is used
                </Link>
              </p>
            </form>
          )
        )}
        {sent && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium">Didn’t receive an email?</summary>
            <form action={resendVerificationAction} className="mt-4 space-y-3">
              <input type="hidden" name="community" value={community.slug} />
              <label className="block">
                Email address
                <input className="field" type="email" name="email" autoComplete="email" required />
              </label>
              <SubmitButton
                idleText="Send a fresh link"
                pendingText="Sending…"
                className="btn-secondary"
              />
            </form>
          </details>
        )}
        <p className="text-sm text-slate-600">
          Already joined?{" "}
          <Link className="font-medium text-emerald-800 underline" href="/member/login">
            Sign in to your elections
          </Link>
        </p>
      </div>
    </section>
  );
}
