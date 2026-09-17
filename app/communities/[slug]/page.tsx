import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { elections } from "@/db/schema";
import { getCommunityBySlug } from "@/lib/community";
import { communityRulesSchema } from "@/lib/community-rules";
import { electionStatusLabel } from "@/lib/election";
export default async function CommunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const community = await getCommunityBySlug(slug);
  if (!community) notFound();
  const rules = communityRulesSchema.parse(community.rulesJson);
  const rows = await db
    .select()
    .from(elections)
    .where(and(eq(elections.communityId, community.id), ne(elections.status, "draft")))
    .orderBy(desc(elections.createdAt));
  return (
    <section className="space-y-8">
      <Link href="/communities" className="text-sm text-emerald-800 underline">
        ← All communities
      </Link>
      <div className="card space-y-5">
        <p className="eyebrow">Your community</p>
        <h1 className="text-4xl font-semibold tracking-tight">{community.name}</h1>
        <p className="max-w-2xl leading-relaxed text-slate-600">{community.description}</p>
        <div className="flex flex-wrap gap-3">
          {rules.registrationOpen && (
            <Link className="btn" href={`/register?community=${community.slug}`}>
              Join this community
            </Link>
          )}
          <Link className="btn-secondary" href="/member/login">
            Already a member? Sign in
          </Link>
        </div>
        <p className="text-sm text-slate-600">
          {rules.registrationOpen
            ? "Self-registration is open. Meet the community’s conditions and verify your email to join—no approval queue."
            : "Registration is currently closed. Existing members can still sign in."}
        </p>
        {community.contactEmail && (
          <a
            href={`mailto:${community.contactEmail}`}
            className="inline-block text-sm text-emerald-800 underline"
          >
            Contact your community manager
          </a>
        )}
      </div>
      <div className="space-y-4">
        <h2 className="text-2xl font-semibold">Community elections</h2>
        {rows.length ? (
          rows.map((e) => (
            <article className="card flex flex-wrap items-center justify-between gap-4" key={e.id}>
              <div>
                <p className="eyebrow mb-2">{electionStatusLabel(e)}</p>
                <h3 className="text-lg font-semibold">{e.name}</h3>
              </div>
              <Link href={`/elections/${e.id}`} className="btn-secondary">
                View election
              </Link>
            </article>
          ))
        ) : (
          <p className="card text-slate-600">
            No elections have been published yet. You can still join so you’re ready for the next
            one.
          </p>
        )}
      </div>
    </section>
  );
}
