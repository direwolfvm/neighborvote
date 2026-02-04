import { desc, eq } from "drizzle-orm";
import { adminLogoutAction } from "@/app/admin/login/actions";
import { SubmitButton } from "@/components/submit-button";
import { db } from "@/db/client";
import { electionEligibility, elections, exportsTable, members } from "@/db/schema";
import { assertAdminAccess } from "@/lib/admin";
import { ballotSchema } from "@/lib/ballot";
import { createSignedExportDownloadUrl } from "@/lib/results-export";
import {
  exportElectionResultsAction,
  setEligibilityAction,
  updateElectionAction
} from "@/app/admin/actions";

interface AdminElectionPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminElectionPage({ params, searchParams }: AdminElectionPageProps) {
  const { id } = await params;

  try {
    await assertAdminAccess();
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

  const paramsQuery = await searchParams;
  const saved = paramsQuery.saved === "1";
  const eligibilitySaved = paramsQuery.eligibility_saved === "1";
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

  const opensValue = election.opensAt
    ? new Date(election.opensAt.getTime() - election.opensAt.getTimezoneOffset() * 60 * 1000)
        .toISOString()
        .slice(0, 16)
    : "";

  const closesValue = election.closesAt
    ? new Date(election.closesAt.getTime() - election.closesAt.getTimezoneOffset() * 60 * 1000)
        .toISOString()
        .slice(0, 16)
    : "";

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold">Manage Election</h1>
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

      {saved ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Election updated.</p>
      ) : null}

      {eligibilitySaved ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Eligibility updated.</p>
      ) : null}

      {exported ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">Results export completed.</p>
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
          {![
            "invalid_ballot_json",
            "invalid_schedule",
            "member_not_found",
            "invalid_update_input",
            "election_not_found",
            "export_failed",
            "notification_failed"
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
            <input className="field" name="name" defaultValue={election.name} required />
          </label>
          <label className="block text-sm">
            Description
            <textarea className="field" name="description" rows={3} defaultValue={election.description ?? ""} />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Status
              <select className="field" name="status" defaultValue={election.status}>
                <option value="draft">draft</option>
                <option value="scheduled">scheduled</option>
                <option value="open">open</option>
                <option value="closed">closed</option>
                <option value="archived">archived</option>
              </select>
            </label>
            <label className="block text-sm">
              Ballot version
              <input className="field" name="ballotVersion" defaultValue={election.ballotVersion} required />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Opens at
              <input className="field" type="datetime-local" name="opensAt" defaultValue={opensValue} />
            </label>
            <label className="block text-sm">
              Closes at
              <input className="field" type="datetime-local" name="closesAt" defaultValue={closesValue} />
            </label>
          </div>
          <label className="block text-sm">
            Ballot JSON
            <textarea
              className="field font-mono text-xs"
              name="ballotJson"
              rows={10}
              defaultValue={JSON.stringify(election.ballotJson, null, 2)}
              required
            />
          </label>
          <SubmitButton idleText="Save election" pendingText="Saving..." />
        </form>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Eligibility</h2>
        <form action={setEligibilityAction} className="space-y-3">
          <input type="hidden" name="electionId" value={election.id} />
          <label className="block text-sm">
            Member email
            <input className="field" type="email" name="memberEmail" required />
          </label>
          <label className="block text-sm">
            Eligible
            <select className="field" name="eligible" defaultValue="true">
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          </label>
          <SubmitButton idleText="Set eligibility" pendingText="Saving..." />
        </form>

        <div>
          <h3 className="text-sm font-medium">Current eligibility list</h3>
          {eligibilityRows.length === 0 ? (
            <p className="text-sm text-slate-600">No members listed yet.</p>
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
                <li key={choice.id}>
                  {choice.id}: {choice.label}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

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
