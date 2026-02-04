import { eq } from "drizzle-orm";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/db/client";
import { elections } from "@/db/schema";
import { ballotSchema } from "@/lib/ballot";
import { isElectionOpen } from "@/lib/election";
import Link from "next/link";
import { castVoteAction } from "@/app/elections/[id]/actions";
import { getMemberFromSession } from "@/lib/member-auth";

interface ElectionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ElectionPage({ params, searchParams }: ElectionPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const member = await getMemberFromSession();

  const [election] = await db
    .select({
      id: elections.id,
      name: elections.name,
      description: elections.description,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      ballotJson: elections.ballotJson
    })
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);

  if (!election) {
    return (
      <section className="card">
        <h1 className="text-2xl font-semibold">Election not found</h1>
      </section>
    );
  }

  const ballot = ballotSchema.safeParse(election.ballotJson);
  const token = typeof query.token === "string" ? query.token : "";
  const sent = query.sent === "1";
  const success = query.success === "1";
  const error = typeof query.error === "string" ? query.error : null;
  const open = isElectionOpen(election);

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold">{election.name}</h1>
        {election.description ? <p className="text-sm text-slate-700">{election.description}</p> : null}
        <p className="text-xs text-slate-500">Status: {election.status}</p>
      </div>

      {sent ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          If your account is eligible, a one-time voting link was sent.
        </p>
      ) : null}

      {success ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Vote submitted.</p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          {error === "election_not_open" ? "This election is not currently open." : null}
          {error === "invalid_or_expired" ? "Voting link is invalid or expired." : null}
          {error === "already_voted" ? "You already voted in this election." : null}
          {error === "invalid_choice" ? "Invalid ballot selection." : null}
          {error === "not_eligible" ? "You are not eligible for this election." : null}
          {error === "already_used" ? "This voting link was already used." : null}
          {error === "vote_failed" ? "Vote could not be submitted." : null}
          {error === "invalid_vote_input" ? "Invalid vote input." : null}
          {![
            "election_not_open",
            "invalid_or_expired",
            "already_voted",
            "invalid_choice",
            "not_eligible",
            "already_used",
            "vote_failed",
            "invalid_vote_input"
          ].includes(error)
            ? "Request failed. Please try again."
            : null}
        </p>
      ) : null}

      {member ? (
        <div className="card">
          <p className="text-sm text-slate-700">
            Logged in as {member.email}. Voting links are requested from the member portal.
          </p>
          <Link className="btn-secondary mt-3 inline-flex" href="/member">
            Back to member portal
          </Link>
        </div>
      ) : (
        <div className="card">
          <p className="text-sm text-slate-700">
            Please request a voting link from the member portal.
          </p>
          <Link className="btn-secondary mt-3 inline-flex" href="/member/login">
            Member login
          </Link>
        </div>
      )}

      {open && token && ballot.success ? (
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold">Cast Vote</h2>
          <Link className="text-sm text-slate-700 underline" href="/member">
            Back to member portal
          </Link>
          <form action={castVoteAction} className="space-y-3">
            <input type="hidden" name="electionId" value={election.id} />
            <input type="hidden" name="token" value={token} />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{ballot.data.title}</legend>
              {ballot.data.choices.map((choice) => (
                <label key={choice.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="choiceId" value={choice.id} required />
                  {choice.label}
                </label>
              ))}
            </fieldset>
            <SubmitButton idleText="Submit vote" pendingText="Submitting..." />
          </form>
        </div>
      ) : null}
    </section>
  );
}
