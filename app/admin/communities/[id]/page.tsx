import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { communities, communityMemberships, elections, members, staffRoles } from "@/db/schema";
import { getAdminActor } from "@/lib/admin";
import { communityRulesSchema } from "@/lib/community-rules";
import { electionStatusLabel } from "@/lib/election";
import {
  saveCommunityAction,
  setCommunityMembershipAction,
  removeCommunityStaffAction
} from "@/app/admin/community-actions";
import {
  bulkImportMembersAction,
  createElectionAction,
  upsertStaffRoleAction
} from "@/app/admin/actions";
import { SubmitButton } from "@/components/submit-button";
import { AdminBallotEditor } from "@/components/admin-ballot-editor";
import { Notice } from "@/components/notice";

export default async function ManageCommunityPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const actor = await getAdminActor(id);
  const [community] = await db.select().from(communities).where(eq(communities.id, id)).limit(1);
  if (!community) notFound();
  const query = await searchParams;
  const search = typeof query.q === "string" ? query.q.slice(0, 100) : "";
  const rules = communityRulesSchema.parse(community.rulesJson);
  const electionRows = await db
    .select()
    .from(elections)
    .where(eq(elections.communityId, id))
    .orderBy(desc(elections.createdAt));
  const roster = await db
    .select({
      id: members.id,
      name: members.fullName,
      email: members.email,
      verified: members.status,
      status: communityMemberships.status
    })
    .from(communityMemberships)
    .innerJoin(members, eq(members.id, communityMemberships.memberId))
    .where(
      and(
        eq(communityMemberships.communityId, id),
        search
          ? or(ilike(members.email, `%${search}%`), ilike(members.fullName, `%${search}%`))
          : undefined
      )
    )
    .orderBy(desc(communityMemberships.joinedAt))
    .limit(100);
  const roles =
    actor.role === "admin"
      ? await db.select().from(staffRoles).where(eq(staffRoles.communityId, id))
      : [];
  return (
    <section className="space-y-7">
      <Link href="/admin" className="text-sm text-emerald-800 underline">
        ← Your communities
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="eyebrow">Community management</p>
          <h1 className="mt-3 text-3xl font-semibold">{community.name}</h1>
        </div>
        <Link className="btn-secondary" href={`/communities/${community.slug}`}>
          View public page
        </Link>
      </div>
      {query.saved && <Notice>Changes saved.</Notice>}
      {query.imported && (
        <Notice>
          Roster imported. New members still need to verify their email and meet the community’s
          registration conditions.
        </Notice>
      )}
      {query.error && (
        <Notice error>
          We couldn’t save those settings. Check names, email addresses, and the boundary file.
          Boundary files must be valid WGS84 GeoJSON polygons, under 500 KB and 5,000 vertices.
        </Notice>
      )}
      <div className="card space-y-4">
        <h2 className="text-xl font-semibold">Elections</h2>
        {electionRows.length ? (
          electionRows.map((e) => (
            <div
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
            >
              <div>
                <p className="font-medium">{e.name}</p>
                <p className="text-sm text-slate-500">{electionStatusLabel(e)}</p>
              </div>
              <Link className="btn-secondary" href={`/admin/elections/${e.id}`}>
                Manage election
              </Link>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-600">No elections yet. Create a draft below.</p>
        )}
        <details className="border-t pt-4">
          <summary className="cursor-pointer font-semibold">Create election</summary>
          <form action={createElectionAction} className="mt-5 space-y-4">
            <input type="hidden" name="communityId" value={id} />
            <label className="block text-sm">
              Election name
              <input className="field" name="name" required minLength={2} maxLength={200} />
            </label>
            <label className="block text-sm">
              Description
              <textarea className="field" name="description" rows={3} maxLength={10000} />
            </label>
            <input type="hidden" name="ballotVersion" value="v1" />
            <AdminBallotEditor
              name="ballotJson"
              initialJson={JSON.stringify({
                title: "What should we decide?",
                choices: [
                  { id: "yes", label: "Yes" },
                  { id: "no", label: "No" },
                  { id: "abstain", label: "Abstain" }
                ]
              })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                Opens at (UTC, optional)
                <input className="field" type="datetime-local" name="opensAt" />
              </label>
              <label className="text-sm">
                Closes at (UTC, optional)
                <input className="field" type="datetime-local" name="closesAt" />
              </label>
            </div>
            <SubmitButton idleText="Create draft election" pendingText="Creating…" />
          </form>
        </details>
      </div>
      <details className="card" open>
        <summary className="cursor-pointer text-xl font-semibold">
          Community & self-registration settings
        </summary>
        <form action={saveCommunityAction} className="mt-5 space-y-5">
          <input type="hidden" name="communityId" value={id} />
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Community name
              <input
                className="field"
                name="name"
                defaultValue={community.name}
                required
                maxLength={200}
              />
            </label>
            <label className="text-sm">
              Manager contact email (optional)
              <input
                className="field"
                type="email"
                name="contactEmail"
                defaultValue={community.contactEmail || ""}
              />
            </label>
          </div>
          <label className="block text-sm">
            About the community
            <textarea
              className="field"
              name="description"
              defaultValue={community.description || ""}
              rows={3}
            />
          </label>
          <label className="flex items-center gap-3 text-sm font-medium">
            <input
              type="checkbox"
              name="registrationOpen"
              defaultChecked={rules.registrationOpen}
            />
            Allow people to self-register without approval
          </label>
          <p className="text-sm leading-relaxed text-slate-600">
            These are trust-based conditions. People provide their own details and verify their
            email. Conditions apply when they join and when they vote; changing a statement asks
            existing members to confirm it again.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Allowed postal codes
              <textarea
                className="field"
                name="allowedPostalCodes"
                rows={3}
                defaultValue={rules.allowedPostalCodes.join("\n")}
              />
              <span className="mt-1 block text-xs text-slate-500">
                One per line or comma separated. Leave blank for any postal code.
              </span>
            </label>
            <label className="text-sm">
              Blocked email domains
              <textarea
                className="field"
                name="blockedEmailDomains"
                rows={3}
                defaultValue={rules.blockedEmailDomains.join("\n")}
              />
              <span className="mt-1 block text-xs text-slate-500">
                For example, example.com. Includes subdomains.
              </span>
            </label>
          </div>
          <label className="block text-sm">
            Blocked email addresses
            <textarea
              className="field"
              name="blockedEmails"
              rows={3}
              defaultValue={rules.blockedEmails.join("\n")}
            />
          </label>
          <label className="block text-sm">
            Required membership statements
            <textarea
              className="field"
              name="attestations"
              rows={4}
              defaultValue={rules.requiredAttestations.map((a) => a.label).join("\n")}
              placeholder="I live within this neighborhood.&#10;I am eligible under our association’s membership rules."
            />
            <span className="mt-1 block text-xs text-slate-500">
              One statement per line. People must check each statement themselves.
            </span>
          </label>
          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-2 text-sm font-semibold">Optional neighborhood boundary</legend>
            <p className="text-sm leading-relaxed text-slate-600">
              {rules.boundary
                ? "A geographic boundary is active."
                : "No geographic boundary is active. An address is not required."}{" "}
              Upload a Polygon or MultiPolygon exported from your GIS tool (WGS84
              longitude/latitude). A single-feature FeatureCollection is also supported.
            </p>
            <label className="block text-sm">
              Upload boundary GeoJSON
              <input
                className="field"
                type="file"
                name="boundaryFile"
                accept=".geojson,.json,application/geo+json,application/json"
              />
            </label>
            {rules.boundary && (
              <label className="flex items-center gap-3 text-sm">
                <input type="checkbox" name="removeBoundary" />
                Remove the current boundary
              </label>
            )}
            <p className="text-xs leading-relaxed text-slate-500">
              US addresses are located using Census address-range geocoding. This checks an
              approximate location, not residency. No documents are collected. On-edge, unmatched,
              or ambiguous addresses are directed to your contact email.
            </p>
          </fieldset>
          <SubmitButton idleText="Save community settings" pendingText="Saving…" />
        </form>
      </details>
      <div className="card space-y-4">
        <h2 className="text-xl font-semibold">Members</h2>
        <form className="flex gap-3">
          <label className="flex-1 text-sm">
            Search names or emails
            <input className="field" name="q" defaultValue={search} />
          </label>
          <button className="btn-secondary self-end">Search</button>
        </form>
        <p className="text-xs text-slate-500">
          Showing up to 100 members. An exclusion affects every election in this community.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-3 pr-4">Member</th>
                <th className="pr-4">Email</th>
                <th className="pr-4">Membership</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((m) => (
                <tr className="border-t" key={m.id}>
                  <td className="py-3 pr-4">{m.name}</td>
                  <td className="pr-4">
                    {m.email}
                    <span className="block text-xs text-slate-500">
                      {m.verified === "verified" ? "Email verified" : "Email not verified"}
                    </span>
                  </td>
                  <td className="pr-4">{m.status}</td>
                  <td>
                    <form action={setCommunityMembershipAction}>
                      <input type="hidden" name="communityId" value={id} />
                      <input type="hidden" name="memberId" value={m.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={m.status === "excluded" ? "active" : "excluded"}
                      />
                      <SubmitButton
                        idleText={m.status === "excluded" ? "Restore" : "Exclude"}
                        pendingText="Saving…"
                        className="btn-secondary"
                      />
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!roster.length && <p className="text-sm text-slate-600">No matching members.</p>}
        <details>
          <summary className="cursor-pointer text-sm font-medium">Import a member roster</summary>
          <form action={bulkImportMembersAction} className="mt-3 space-y-3">
            <input type="hidden" name="communityId" value={id} />
            <label className="block text-sm">
              CSV with name,email columns (up to 2,000 rows, 500 KB)
              <input
                className="field"
                type="file"
                name="membersCsv"
                accept=".csv,text/csv"
                required
              />
            </label>
            <SubmitButton idleText="Import roster" pendingText="Importing…" />
          </form>
        </details>
      </div>
      {actor.role === "admin" && (
        <details className="card">
          <summary className="cursor-pointer text-xl font-semibold">Community staff</summary>
          <p className="mt-3 text-sm text-slate-600">
            Staff access is limited to this community. Administrators can also add other staff.
          </p>
          <ul className="my-4 space-y-2 text-sm">
            {roles.map((r) => (
              <li key={r.id}>
                {r.email} · {r.role === "admin" ? "Administrator" : "Community manager"}
                {(actor.source === "env" || actor.email !== r.email) && (
                  <form action={removeCommunityStaffAction} className="mt-2">
                    <input type="hidden" name="communityId" value={id} />
                    <input type="hidden" name="email" value={r.email} />
                    <SubmitButton
                      idleText="Remove access"
                      pendingText="Removing…"
                      className="btn-secondary"
                    />
                  </form>
                )}
              </li>
            ))}
          </ul>
          <form action={upsertStaffRoleAction} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <input type="hidden" name="communityId" value={id} />
            <label className="text-sm">
              Staff email
              <input className="field" type="email" name="email" required />
            </label>
            <label className="text-sm">
              Role
              <select className="field" name="role">
                <option value="election_manager">Community manager</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <SubmitButton
              idleText="Save staff role"
              pendingText="Saving…"
              className="btn self-end"
            />
          </form>
        </details>
      )}
    </section>
  );
}
