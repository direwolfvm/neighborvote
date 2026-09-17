import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import {
  communities,
  communityMemberships,
  electionEligibility,
  elections,
  votes
} from "@/db/schema";
import { getMemberFromSession } from "@/lib/member-auth";
import { evaluateCommunityRules } from "@/lib/community-rules";
import { electionStatusLabel, isElectionOpen } from "@/lib/election";
import { requestVoteLinkAction } from "@/app/elections/[id]/actions";
import { memberLogoutAction } from "@/app/member/login/actions";
import { SubmitButton } from "@/components/submit-button";
import { Notice, requestErrors } from "@/components/notice";
export default async function MemberHomePage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const member = await getMemberFromSession();
  if (!member) redirect("/member/login");
  const query = await searchParams;
  const memberships = await db
    .select({
      id: communities.id,
      name: communities.name,
      slug: communities.slug,
      rules: communities.rulesJson,
      status: communityMemberships.status,
      answers: communityMemberships.answersJson
    })
    .from(communityMemberships)
    .innerJoin(communities, eq(communities.id, communityMemberships.communityId))
    .where(eq(communityMemberships.memberId, member.id));
  const rows = await db
    .select({
      id: elections.id,
      name: elections.name,
      description: elections.description,
      communityId: elections.communityId,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      castAt: votes.castAt,
      eligible: electionEligibility.eligible
    })
    .from(elections)
    .innerJoin(
      communityMemberships,
      and(
        eq(communityMemberships.communityId, elections.communityId),
        eq(communityMemberships.memberId, member.id)
      )
    )
    .leftJoin(votes, and(eq(votes.electionId, elections.id), eq(votes.memberId, member.id)))
    .leftJoin(
      electionEligibility,
      and(
        eq(electionEligibility.electionId, elections.id),
        eq(electionEligibility.memberId, member.id)
      )
    )
    .where(ne(elections.status, "draft"))
    .orderBy(desc(elections.createdAt));
  return (
    <section className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Your place in the conversation</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Welcome, {member.fullName}.
          </h1>
          <p className="mt-2 text-sm text-slate-600">Signed in as {member.email}</p>
        </div>
        <form action={memberLogoutAction}>
          <button className="btn-secondary">Sign out</button>
        </form>
      </div>
      {query.verified && (
        <Notice>
          You’re all set. Your email is verified and your community membership is ready.
        </Notice>
      )}
      {query.sent && (
        <Notice>
          If you’re eligible and haven’t voted, a private voting link is on its way. Check your
          inbox and spam folder. The link expires in two hours or when voting closes.
        </Notice>
      )}
      {typeof query.error === "string" && (
        <Notice error>
          {requestErrors[query.error] ||
            "We couldn’t complete that request. The election may have closed; please try again."}
        </Notice>
      )}
      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Your communities</h2>
        <div className="flex flex-wrap gap-3">
          {memberships.map((c) => (
            <Link className="btn-secondary" key={c.id} href={`/communities/${c.slug}`}>
              {c.name}
            </Link>
          ))}
          <Link href="/communities" className="btn-secondary">
            + Join a community
          </Link>
        </div>
      </div>
      {memberships.map((c) => {
        const result = evaluateCommunityRules(c.rules, member.email, c.answers);
        return c.status === "excluded" ? (
          <Notice error key={c.id}>
            Your membership in {c.name} is excluded from voting. Contact the community manager for
            help.
          </Notice>
        ) : !result.allowed ? (
          <Notice key={c.id}>
            {c.name} needs updated membership details.{" "}
            <Link className="font-semibold underline" href={`/register?community=${c.slug}`}>
              Review the conditions and update your details
            </Link>
            .
          </Notice>
        ) : null;
      })}
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Your elections</h2>
        {rows.length ? (
          rows.map((e) => {
            const community = memberships.find((c) => c.id === e.communityId)!;
            const eligible =
              community.status === "active" &&
              e.eligible !== false &&
              evaluateCommunityRules(community.rules, member.email, community.answers).allowed;
            return (
              <article key={e.id} className="card space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="eyebrow mb-2">{community.name}</p>
                    <h3 className="text-xl font-semibold">{e.name}</h3>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-900">
                    {electionStatusLabel(e)}
                  </span>
                </div>
                {e.description && (
                  <p className="text-sm leading-relaxed text-slate-600">{e.description}</p>
                )}
                {e.castAt ? (
                  <Notice>Your vote is recorded. Thank you for taking part.</Notice>
                ) : isElectionOpen(e) && eligible ? (
                  <form action={requestVoteLinkAction}>
                    <input type="hidden" name="electionId" value={e.id} />
                    <input type="hidden" name="email" value={member.email} />
                    <input type="hidden" name="returnTo" value="/member" />
                    <SubmitButton
                      idleText="Email me my ballot"
                      pendingText="Sending your ballot…"
                    />
                  </form>
                ) : !eligible ? (
                  <p className="text-sm text-slate-600">
                    Your current membership does not qualify for this election.
                  </p>
                ) : (
                  <p className="text-sm text-slate-600">
                    {electionStatusLabel(e) === "Upcoming"
                      ? "Your ballot will be available when voting opens."
                      : "Voting has ended."}
                  </p>
                )}
                <Link
                  className="inline-block text-sm text-emerald-800 underline"
                  href={`/elections/${e.id}`}
                >
                  View election details
                </Link>
              </article>
            );
          })
        ) : (
          <div className="card space-y-2">
            <p className="font-medium">Nothing on the ballot just yet.</p>
            <p className="text-sm text-slate-600">
              When your community opens an election, you’ll find it here. Eligible members also
              receive an email update.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
