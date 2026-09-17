import { and, desc, eq, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { z } from "zod";
import { isElectionOpen } from "@/lib/election";
import { evaluateCommunityRules } from "@/lib/community-rules";
import { Notice } from "@/components/notice";
import { communities, communityMemberships, electionNotifications } from "@/db/schema";

import { adminLogoutAction } from "@/app/admin/login/actions";
import { SubmitButton } from "@/components/submit-button";
import { AdminBallotEditor } from "@/components/admin-ballot-editor";
import { db } from "@/db/client";
import {
  electionEligibility,
  elections,
  exportsTable,
  manualVoteCounts,
  members,
  votes
} from "@/db/schema";
import { getElectionActor } from "@/lib/admin";
import { ballotSchema } from "@/lib/ballot";
import { createSignedExportDownloadUrl } from "@/lib/results-export";
import {
  exportElectionResultsAction,
  retryElectionNotificationsAction,
  setManualVoteCountsAction,
  setEligibilityAction,
  updateElectionAction
} from "@/app/admin/actions";

interface AdminElectionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminElectionPage({ params, searchParams }: AdminElectionPageProps) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  try {
    await getElectionActor(id);
  } catch (error) {
    return (
      <section className="card space-y-2">
        <h1 className="text-2xl font-semibold">Admin Election</h1>
        <p className="text-sm text-rose-700">{(error as Error).message}</p>
      </section>
    );
  }

  const [election] = await db
    .select({
      id: elections.id,
      communityId: elections.communityId,
      name: elections.name,
      description: elections.description,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      ballotVersion: elections.ballotVersion,
      ballotJson: elections.ballotJson,
      notificationSentAt: elections.notificationSentAt,
      notificationSentCount: elections.notificationSentCount
    })
    .from(elections)
    .where(eq(elections.id, id))
    .limit(1);

  if (!election) {
    return (
      <section className="card space-y-2">
        <h1 className="text-2xl font-semibold">Election not found</h1>
      </section>
    );
  }

  const canEditBallot =
    election.status === "draft" ||
    (election.status === "scheduled" && election.opensAt !== null && election.opensAt > new Date());
  const canEditDescription =
    canEditBallot || election.status === "open" || election.status === "scheduled";
  const canEditEligibility = election.status !== "closed" && election.status !== "archived";
  const canViewResults =
    isElectionOpen(election) || election.status === "closed" || election.status === "archived";

  const paramsQuery = await searchParams;
  const saved = paramsQuery.saved === "1";
  const eligibilitySaved = paramsQuery.eligibility_saved === "1";
  const manualSaved = paramsQuery.manual_saved === "1";
  const exported = paramsQuery.exported === "1";
  const error = typeof paramsQuery.error === "string" ? paramsQuery.error : null;

  const eligibilityRows = await db
    .select({
      memberId: members.id,
      fullName: members.fullName,
      email: members.email,
      eligible: electionEligibility.eligible,
      includedAt: electionEligibility.includedAt
    })
    .from(electionEligibility)
    .innerJoin(members, eq(electionEligibility.memberId, members.id))
    .where(eq(electionEligibility.electionId, election.id))
    .orderBy(desc(electionEligibility.includedAt));

  const ballotPreview = ballotSchema.safeParse(election.ballotJson);

  const voteCountRows = canViewResults
    ? await db
        .select({
          choiceId: sql<string>`(votes.vote_payload_json->>'choiceId')`,
          count: sql<number>`count(*)`
        })
        .from(votes)
        .where(eq(votes.electionId, election.id))
        .groupBy(sql`(votes.vote_payload_json->>'choiceId')`)
    : [];

  const manualCountRows = canViewResults
    ? await db
        .select({
          choiceId: manualVoteCounts.choiceId,
          count: manualVoteCounts.count,
          updatedAt: manualVoteCounts.updatedAt,
          updatedBy: manualVoteCounts.updatedBy
        })
        .from(manualVoteCounts)
        .where(eq(manualVoteCounts.electionId, election.id))
    : [];

  const [{ count: voteTotalRaw }] = canViewResults
    ? await db
        .select({
          count: sql<number>`count(*)`
        })
        .from(votes)
        .where(eq(votes.electionId, election.id))
    : [{ count: 0 }];

  const eligibleMembers = await db
    .select({
      email: members.email,
      rules: communities.rulesJson,
      answers: communityMemberships.answersJson,
      excluded: electionEligibility.eligible
    })
    .from(communityMemberships)
    .innerJoin(members, eq(members.id, communityMemberships.memberId))
    .innerJoin(communities, eq(communities.id, communityMemberships.communityId))
    .leftJoin(
      electionEligibility,
      and(eq(electionEligibility.memberId, members.id), eq(electionEligibility.electionId, id))
    )
    .where(
      and(
        eq(communityMemberships.communityId, election.communityId),
        eq(communityMemberships.status, "active"),
        eq(members.status, "verified")
      )
    );
  const voteTotal = Number(voteTotalRaw ?? 0);
  const eligibleCount = eligibleMembers.filter(
    (m) => m.excluded !== false && evaluateCommunityRules(m.rules, m.email, m.answers).allowed
  ).length;
  const deliveryRows = await db
    .select({ status: electionNotifications.status, count: sql<number>`count(*)::int` })
    .from(electionNotifications)
    .where(eq(electionNotifications.electionId, id))
    .groupBy(electionNotifications.status);

  const manualCountsByChoice = new Map(
    manualCountRows.map((row) => [row.choiceId, Number(row.count ?? 0)])
  );
  const recordedCountsByChoice = new Map(
    voteCountRows.map((row) => [row.choiceId, Number(row.count ?? 0)])
  );
  const exportRows = await db
    .select({
      id: exportsTable.id,
      gcsPath: exportsTable.gcsPath,
      sha256: exportsTable.sha256,
      createdAt: exportsTable.createdAt
    })
    .from(exportsTable)
    .where(eq(exportsTable.electionId, election.id))
    .orderBy(desc(exportsTable.createdAt));

  const exportRowsWithLinks = await Promise.all(
    exportRows.map(async (row) => {
      try {
        const downloadUrl = await createSignedExportDownloadUrl(row.gcsPath);
        return { ...row, downloadUrl };
      } catch {
        return { ...row, downloadUrl: null };
      }
    })
  );

  const opensValue = election.opensAt ? election.opensAt.toISOString().slice(0, 16) : "";

  const closesValue = election.closesAt ? election.closesAt.toISOString().slice(0, 16) : "";

  const statusOptions = canEditBallot
    ? ["draft", "scheduled", "open", "closed", "archived"]
    : election.status === "open" || election.status === "closed" || election.status === "scheduled"
      ? Array.from(new Set([election.status, "open", "closed", "archived"]))
      : ["archived"];

  const percentFormatter = new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1
  });

  const totalCombined =
    canViewResults && ballotPreview.success
      ? ballotPreview.data.choices.reduce((sum, choice) => {
          const recorded = recordedCountsByChoice.get(choice.id) ?? 0;
          const manual = manualCountsByChoice.get(choice.id) ?? 0;
          return sum + recorded + manual;
        }, 0)
      : 0;

  const latestManualUpdate =
    manualCountRows.length > 0
      ? manualCountRows.reduce<Date | null>((latest, row) => {
          if (!latest || row.updatedAt > latest) {
            return row.updatedAt;
          }
          return latest;
        }, null)
      : null;

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <a
          className="text-sm text-emerald-800 underline"
          href={`/admin/communities/${election.communityId}`}
        >
          ← Back to community
        </a>
        <h1 className="text-2xl font-semibold">{election.name}</h1>
        <p className="text-sm text-slate-700">
          <code>{election.id}</code>
        </p>
        <p className="text-xs text-slate-600">
          Notifications:{" "}
          {election.notificationSentAt
            ? `sent to ${election.notificationSentCount} members at ${election.notificationSentAt.toISOString()}`
            : "not sent"}
        </p>
        <form action={adminLogoutAction}>
          <button type="submit" className="btn-secondary">
            Log out
          </button>
        </form>
      </div>

      {deliveryRows.length > 0 && (
        <Notice>
          Opening emails:{" "}
          {deliveryRows
            .map((r) => `${r.count} ${r.status === "sent" ? "accepted by provider" : r.status}`)
            .join(" · ")}
          . Uncertain deliveries are not automatically resent; check Mailgun logs before retrying.
        </Notice>
      )}
      {deliveryRows.some((row) => ["pending", "failed", "uncertain"].includes(row.status)) && (
        <form action={retryElectionNotificationsAction} className="card space-y-3">
          <input type="hidden" name="electionId" value={id} />
          <p className="text-sm text-slate-600">
            Send up to 20 pending or failed notices now. The scheduler continues the remaining
            batch.
          </p>
          {deliveryRows.some((row) => row.status === "uncertain") && (
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" name="confirmedUnsent" />I checked Mailgun logs and confirmed
              uncertain messages were not sent. Include those in this retry.
            </label>
          )}
          <SubmitButton idleText="Send pending notices" pendingText="Sending notices…" />
        </form>
      )}
      {saved ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Election updated.</p>
      ) : null}

      {eligibilitySaved ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Eligibility updated.
        </p>
      ) : null}

      {manualSaved ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Manual counts updated.
        </p>
      ) : null}

      {exported ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Results export completed.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          {error === "invalid_ballot_json" ? "Ballot JSON is invalid." : null}
          {error === "invalid_schedule" ? "Schedule fields are invalid." : null}
          {error === "member_not_found" ? "Member email not found." : null}
          {error === "invalid_update_input" ? "Election update input is invalid." : null}
          {error === "election_not_found" ? "Election not found." : null}
          {error === "export_failed" ? "Export failed. Check Cloud Storage configuration." : null}
          {error === "notification_failed" ? "Vote notification emails could not be sent." : null}
          {error === "election_locked"
            ? "This election is locked and cannot be edited in its current state."
            : null}
          {error === "invalid_manual_counts"
            ? "Manual counts must be whole numbers zero or greater."
            : null}
          {![
            "invalid_ballot_json",
            "invalid_schedule",
            "member_not_found",
            "invalid_update_input",
            "election_not_found",
            "export_failed",
            "notification_failed",
            "election_locked",
            "invalid_manual_counts"
          ].includes(error)
            ? "Update failed."
            : null}
        </p>
      ) : null}

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Election Settings</h2>
        <form action={updateElectionAction} className="space-y-3">
          <input type="hidden" name="electionId" value={election.id} />
          <label className="block text-sm">
            Name
            <input
              className="field"
              name="name"
              defaultValue={election.name}
              required
              readOnly={!canEditBallot}
            />
          </label>
          <label className="block text-sm">
            Description
            <textarea
              className="field"
              name="description"
              rows={3}
              defaultValue={election.description ?? ""}
              readOnly={!canEditDescription}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Status
              <select className="field" name="status" defaultValue={election.status}>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              Ballot version
              <input
                className="field"
                name="ballotVersion"
                defaultValue={election.ballotVersion}
                required
                readOnly={!canEditBallot}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Opens at (UTC)
              <input
                className="field"
                type="datetime-local"
                name="opensAt"
                defaultValue={opensValue}
                readOnly={!canEditBallot}
              />
            </label>
            <label className="block text-sm">
              Closes at (UTC)
              <input
                className="field"
                type="datetime-local"
                name="closesAt"
                defaultValue={closesValue}
                readOnly={!canEditBallot}
              />
            </label>
          </div>
          <div className="block text-sm">
            <p className="mb-2 font-medium">Ballot</p>
            <AdminBallotEditor
              name="ballotJson"
              initialJson={JSON.stringify(election.ballotJson, null, 2)}
              readOnly={!canEditBallot}
            />
          </div>
          {!canEditBallot ? (
            <p className="text-xs text-slate-600">
              Ballot fields are locked once an election opens.
            </p>
          ) : null}
          <SubmitButton idleText="Save election" pendingText="Saving..." />
        </form>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Election-specific exclusions</h2>
        {canEditEligibility ? (
          <form action={setEligibilityAction} className="space-y-3">
            <input type="hidden" name="electionId" value={election.id} />
            <label className="block text-sm">
              Member email
              <input className="field" type="email" name="memberEmail" required />
            </label>
            <label className="block text-sm">
              Eligible
              <select className="field" name="eligible" defaultValue="true">
                <option value="true">Include, subject to community rules</option>
                <option value="false">Exclude from this election</option>
              </select>
            </label>
            <SubmitButton idleText="Set eligibility" pendingText="Saving..." />
          </form>
        ) : (
          <p className="text-sm text-slate-600">Eligibility is locked once the election closes.</p>
        )}

        <div>
          <h3 className="text-sm font-medium">Current election exceptions</h3>
          {eligibilityRows.length === 0 ? (
            <p className="text-sm text-slate-600">
              No election-specific exceptions. Community eligibility rules still apply.
            </p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {eligibilityRows.map((row) => (
                <li key={row.memberId}>
                  {row.fullName} ({row.email}) - {row.eligible ? "eligible" : "ineligible"}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card space-y-2">
        <h2 className="text-lg font-semibold">Ballot Preview</h2>
        {!ballotPreview.success ? (
          <p className="text-sm text-rose-700">Ballot JSON currently fails schema validation.</p>
        ) : (
          <div className="text-sm text-slate-700">
            <p className="font-medium">{ballotPreview.data.title}</p>
            <ul className="mt-1 list-disc pl-5">
              {ballotPreview.data.choices.map((choice) => (
                <li key={choice.id}>{choice.label}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {canViewResults ? (
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold">Results</h2>
          {!ballotPreview.success ? (
            <p className="text-sm text-rose-700">
              Results unavailable because the ballot is invalid.
            </p>
          ) : (
            <>
              <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                <p className="font-medium">Turnout</p>
                <p>
                  {voteTotal} electronic votes recorded · {eligibleCount} currently eligible
                  members.
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Changes to membership eligibility do not remove previously recorded votes.
                </p>
              </div>
              <div className="space-y-3">
                {ballotPreview.data.choices.map((choice) => {
                  const recorded = recordedCountsByChoice.get(choice.id) ?? 0;
                  const manual = manualCountsByChoice.get(choice.id) ?? 0;
                  const total = recorded + manual;
                  const percent = totalCombined > 0 ? total / totalCombined : 0;

                  return (
                    <div key={choice.id} className="rounded-md bg-slate-50 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">{choice.label}</p>
                        <p className="text-sm text-slate-700">
                          {total} {total === 1 ? "vote" : "votes"} (
                          {percentFormatter.format(percent)})
                        </p>
                      </div>
                      <div className="mt-2 h-2 rounded bg-slate-200">
                        <div
                          className="h-2 rounded bg-emerald-500"
                          style={{
                            width: `${totalCombined > 0 ? (total / totalCombined) * 100 : 0}%`
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-600">
                        Recorded: {recorded} · Manual: {manual}
                      </p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}

      {canViewResults && election.status !== "archived" ? (
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold">Manual Vote Counts</h2>
          {!ballotPreview.success ? (
            <p className="text-sm text-rose-700">
              Manual counts unavailable because the ballot is invalid.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-700">
                Manual counts are added to recorded votes for reporting totals.
              </p>
              {latestManualUpdate ? (
                <p className="text-xs text-slate-600">
                  Last updated {latestManualUpdate.toISOString()}.
                </p>
              ) : null}
              <form action={setManualVoteCountsAction} className="space-y-3">
                <input type="hidden" name="electionId" value={election.id} />
                {ballotPreview.data.choices.map((choice) => (
                  <label key={choice.id} className="block text-sm">
                    {choice.label}
                    <input
                      className="field"
                      type="number"
                      min="0"
                      name={`manualCount:${choice.id}`}
                      defaultValue={manualCountsByChoice.get(choice.id) ?? 0}
                    />
                  </label>
                ))}
                <SubmitButton idleText="Save manual counts" pendingText="Saving..." />
              </form>
            </>
          )}
        </div>
      ) : null}

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Exports</h2>
        <form action={exportElectionResultsAction}>
          <input type="hidden" name="electionId" value={election.id} />
          <SubmitButton idleText="Export results bundle" pendingText="Exporting..." />
        </form>
        {exportRowsWithLinks.length === 0 ? (
          <p className="text-sm text-slate-600">No exports generated yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {exportRowsWithLinks.map((row) => (
              <li key={row.id} className="rounded-md bg-slate-50 p-2 ring-1 ring-slate-200">
                <p className="font-mono text-xs">{row.gcsPath}</p>
                <p className="text-xs text-slate-600">SHA256: {row.sha256}</p>
                <p className="text-xs text-slate-600">{row.createdAt.toISOString()}</p>
                {row.downloadUrl ? (
                  <p className="pt-1">
                    <a className="text-xs text-slate-900 underline" href={row.downloadUrl}>
                      Download (signed URL)
                    </a>
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">Signed URL unavailable.</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
