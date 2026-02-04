import Link from "next/link";
import { desc } from "drizzle-orm";
import { SubmitButton } from "@/components/submit-button";
import { adminLogoutAction } from "@/app/admin/login/actions";
import { db } from "@/db/client";
import { elections } from "@/db/schema";
import { assertAdminAccess } from "@/lib/admin";
import { bulkImportMembersAction, createElectionAction } from "@/app/admin/actions";

export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  try {
    await assertAdminAccess();
  } catch (error) {
    return (
      <section className="card space-y-2">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-rose-700">{(error as Error).message}</p>
      </section>
    );
  }

  const params = await searchParams;
  const imported = typeof params.imported === "string" ? params.imported : null;
  const included = typeof params.included === "string" ? params.included : null;
  const error = typeof params.error === "string" ? params.error : null;

  const electionRows = await db
    .select({ id: elections.id, name: elections.name, status: elections.status })
    .from(elections)
    .orderBy(desc(elections.createdAt));

  return (
    <section className="space-y-4">
      <div className="card space-y-2">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="text-sm text-slate-700">Create elections and import members.</p>
        <form action={adminLogoutAction}>
          <button type="submit" className="btn-secondary">
            Log out
          </button>
        </form>
      </div>

      {imported ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Import completed: {imported} members upserted, {included ?? "0"} added/updated in eligibility.
        </p>
      ) : null}

      {error ? (
        <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
          {error === "missing_csv" ? "Please upload a CSV file." : null}
          {error === "invalid_csv" ? "CSV must include header columns: name,email." : null}
          {error === "empty_csv" ? "CSV has no importable rows." : null}
          {error === "invalid_election_input" ? "Invalid election input." : null}
          {error === "invalid_ballot_json" ? "Ballot JSON is invalid." : null}
          {error === "invalid_schedule" ? "Invalid election schedule." : null}
          {error === "election_not_found" ? "Selected election not found." : null}
          {![
            "missing_csv",
            "invalid_csv",
            "empty_csv",
            "invalid_election_input",
            "invalid_ballot_json",
            "invalid_schedule",
            "election_not_found"
          ].includes(error)
            ? "Action failed."
            : null}
        </p>
      ) : null}

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Create Election</h2>
        <form action={createElectionAction} className="space-y-3">
          <label className="block text-sm">
            Name
            <input className="field" name="name" required />
          </label>
          <label className="block text-sm">
            Description
            <textarea className="field" name="description" rows={3} />
          </label>
          <label className="block text-sm">
            Ballot version
            <input className="field" name="ballotVersion" defaultValue="v1" required />
          </label>
          <label className="block text-sm">
            Ballot JSON
            <textarea
              className="field font-mono text-xs"
              name="ballotJson"
              rows={8}
              required
              defaultValue={JSON.stringify(
                {
                  title: "Neighborhood Board Election",
                  choices: [
                    { id: "candidate_a", label: "Candidate A" },
                    { id: "candidate_b", label: "Candidate B" },
                    { id: "abstain", label: "Abstain" }
                  ]
                },
                null,
                2
              )}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block text-sm">
              Opens at (optional)
              <input className="field" type="datetime-local" name="opensAt" />
            </label>
            <label className="block text-sm">
              Closes at (optional)
              <input className="field" type="datetime-local" name="closesAt" />
            </label>
          </div>
          <SubmitButton idleText="Create election" pendingText="Creating..." />
        </form>
      </div>

      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Bulk Import Members</h2>
        <form action={bulkImportMembersAction} className="space-y-3">
          <label className="block text-sm">
            CSV file (`name,email`)
            <input className="field" type="file" name="membersCsv" accept=".csv,text/csv" required />
          </label>
          <label className="block text-sm">
            Include imported members in election (optional)
            <select className="field" name="electionId" defaultValue="">
              <option value="">No election</option>
              {electionRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.status})
                </option>
              ))}
            </select>
          </label>
          <SubmitButton idleText="Import CSV" pendingText="Importing..." />
        </form>
      </div>

      <div className="card space-y-2">
        <h2 className="text-lg font-semibold">Elections</h2>
        {electionRows.length === 0 ? <p className="text-sm text-slate-700">No elections yet.</p> : null}
        <ul className="space-y-1 text-sm">
          {electionRows.map((row) => (
            <li key={row.id}>
              <Link className="text-slate-900 underline" href={`/admin/elections/${row.id}`}>
                {row.name}
              </Link>{" "}
              <span className="text-slate-500">({row.status})</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
