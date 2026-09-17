import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import { communities } from "@/db/schema";
export const dynamic = "force-dynamic";
export default async function CommunitiesPage() {
  const rows = await db
    .select({
      slug: communities.slug,
      name: communities.name,
      description: communities.description
    })
    .from(communities)
    .orderBy(asc(communities.name));
  return (
    <section className="space-y-8">
      <div className="max-w-2xl space-y-3">
        <p className="eyebrow">A place to belong</p>
        <h1 className="text-4xl font-semibold tracking-tight">Find your community.</h1>
        <p className="text-slate-600">
          Each community sets its own membership conditions and runs its own elections. Choose yours
          to get started.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((c) => (
          <article className="card space-y-4" key={c.slug}>
            <h2 className="text-xl font-semibold">{c.name}</h2>
            <p className="text-sm leading-relaxed text-slate-600">
              {c.description || "Join your neighbors and take part in local decisions."}
            </p>
            <Link className="btn-secondary" href={`/communities/${c.slug}`}>
              View community <span aria-hidden="true">↗</span>
            </Link>
          </article>
        ))}
      </div>
      {!rows.length && (
        <p className="card">Communities are being set up. Please check back soon.</p>
      )}
    </section>
  );
}
