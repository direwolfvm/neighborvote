import Link from "next/link";
import { desc } from "drizzle-orm";
import { SubmitButton } from "@/components/submit-button";
import { adminLogoutAction } from "@/app/admin/login/actions";
import { db } from "@/db/client";
import { elections, staffRoles } from "@/db/schema";
import { assertAdminAccess, getAdminActor } from "@/lib/admin";
import { parseAdminEmails } from "@/lib/email";
import {
  bulkImportMembersAction,
  createElectionAction,
  upsertStaffRoleAction
} from "@/app/admin/actions";

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
  const staffRoleSaved = params.staff_role_saved === "1";
  const error = typeof params.error === "string" ? params.error : null;
  const actor = await getAdminActor();

  const electionRows = await db
    .select({
      id: elections.id,
      name: elections.name,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt
    })
    .from(elections)
    .orderBy(desc(elections.createdAt));

  const dbRoleRows =
    actor.role === "admin"
      ? await db
          .select({
            email: staffRoles.email,
            role: staffRoles.role,
            addedBy: staffRoles.addedBy,
            createdAt: staffRoles.createdAt
          })
          .from(staffRoles)
          .orderBy(desc(staffRoles.createdAt))
      : [];

  const roleRows =
    actor.role === "admin"
      ? [
          ...dbRoleRows,
          ...Array.from(parseAdminEmails(process.env.ADMIN_EMAILS))
            .filter((email) => !dbRoleRows.some((row) => row.email === email))
            .map((email) => ({
              email,
              role: "admin" as const,
              addedBy: "ADMIN_EMAILS",
              createdAt: new Date(0)
            }))
        ]
      : [];

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
          Import completed: {imported} members upserted. Imported members are eligible by default.
        </p>
      ) : null}

      {staffRoleSaved ? (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          Staff role saved.
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
          {error === "invalid_staff_role_input" ? "Invalid staff role input." : null}
          {![
            "missing_csv",
            "invalid_csv",
            "empty_csv",
            "invalid_election_input",
            "invalid_ballot_json",
            "invalid_schedule",
            "election_not_found",
            "invalid_staff_role_input"
          ].includes(error)
            ? "Action failed."
            : null}
        </p>
      ) : null}

      {actor.role === "admin" ? (
        <div className="card space-y-3">
          <h2 className="text-lg font-semibold">Staff Roles</h2>
          <p className="text-sm text-slate-700">
            Admins and election managers can manage elections. Only admins can manage staff roles.
          </p>
          <form action={upsertStaffRoleAction} className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <label className="block text-sm">
              Email
              <input className="field" type="email" name="email" required />
            </label>
            <label className="block text-sm">
              Role
              <select className="field" name="role" defaultValue="election_manager">
                <option value="election_manager">election_manager</option>
                <option value="admin">admin</option>
              </select>
            </label>
            <SubmitButton idleText="Save role" pendingText="Saving..." />
          </form>
          {roleRows.length === 0 ? (
            <p className="text-sm text-slate-600">No staff roles stored yet. `ADMIN_EMAILS` fallback still works.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Added By</th>
                    <th className="py-2">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {roleRows.map((row) => (
                    <tr key={row.email}>
                      <td className="py-2 pr-3 text-slate-900">{row.email}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.role}</td>
                      <td className="py-2 pr-3 text-slate-600">{row.addedBy}</td>
                      <td className="py-2 text-slate-600">{row.createdAt.toISOString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}

      <div className="card space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Elections</h2>
          <Link className="btn" href="#create-election">
            Create election
          </Link>
        </div>
        {electionRows.length === 0 ? (
          <p className="text-sm text-slate-700">No elections yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">Election</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Opens</th>
                  <th className="py-2 pr-3">Closes</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {electionRows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="py-2 pr-3">
                      <p className="font-medium text-slate-900">{row.name}</p>
                      <p className="text-xs text-slate-500">{row.id}</p>
                    </td>
                    <td className="py-2 pr-3 text-slate-600">{row.status}</td>
                    <td className="py-2 pr-3 text-slate-600">
                      {row.opensAt ? row.opensAt.toISOString() : "—"}
                    </td>
                    <td className="py-2 pr-3 text-slate-600">
                      {row.closesAt ? row.closesAt.toISOString() : "—"}
                    </td>
                    <td className="py-2">
                      <Link className="text-slate-900 underline" href={`/admin/elections/${row.id}`}>
                        {row.status === "draft" ? "Edit" : "Manage"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card space-y-3" id="create-election">
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
          <SubmitButton idleText="Import CSV" pendingText="Importing..." />
        </form>
      </div>
    </section>
  );
}
