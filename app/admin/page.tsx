import Link from "next/link";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { communities, staffRoles } from "@/db/schema";
import { getAdminActor } from "@/lib/admin";
import { adminLogoutAction } from "@/app/admin/login/actions";
import { createCommunityAction } from "@/app/admin/community-actions";
import { SubmitButton } from "@/components/submit-button";
import { Notice } from "@/components/notice";
export default async function AdminPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await getAdminActor();
  const params = await searchParams;
  const roles = await db.select().from(staffRoles).where(eq(staffRoles.email, actor.email));
  const rows = await db
    .select()
    .from(communities)
    .where(
      actor.source === "env"
        ? undefined
        : inArray(
            communities.id,
            roles.map((r) => r.communityId)
          )
    )
    .orderBy(asc(communities.name));
  return (
    <section className="space-y-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Community management</p>
          <h1 className="mt-3 text-3xl font-semibold">Your communities</h1>
          <p className="mt-2 text-sm text-slate-600">Signed in as {actor.email}</p>
        </div>
        <form action={adminLogoutAction}>
          <button className="btn-secondary">Sign out</button>
        </form>
      </div>
      {params.error && (
        <Notice error>
          {params.error === "community_create_failed"
            ? "We couldn’t create that community. Its URL may already be in use."
            : "Please check the details and try again."}
        </Notice>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((c) => (
          <article className="card space-y-4" key={c.id}>
            <h2 className="text-xl font-semibold">{c.name}</h2>
            <p className="text-sm text-slate-600">/{c.slug}</p>
            <div className="flex flex-wrap gap-3">
              <Link className="btn" href={`/admin/communities/${c.id}`}>
                Manage community
              </Link>
              <Link className="btn-secondary" href={`/communities/${c.slug}`}>
                Public page
              </Link>
            </div>
          </article>
        ))}
      </div>
      {actor.source === "env" && (
        <details className="card">
          <summary className="cursor-pointer text-lg font-semibold">Create a community</summary>
          <form action={createCommunityAction} className="mt-5 max-w-lg space-y-4">
            <label className="block text-sm">
              Community name
              <input className="field" name="name" required minLength={2} maxLength={200} />
            </label>
            <label className="block text-sm">
              Community URL name
              <input
                className="field"
                name="slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                maxLength={80}
                placeholder="oak-grove"
              />
              <span className="mt-2 block text-xs text-slate-500">
                Lowercase letters, numbers, and hyphens. This becomes /communities/oak-grove.
              </span>
            </label>
            <SubmitButton idleText="Create community" pendingText="Creating…" />
          </form>
        </details>
      )}
    </section>
  );
}
