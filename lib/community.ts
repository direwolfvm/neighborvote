import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { communities, communityMemberships } from "@/db/schema";
import { evaluateCommunityRules } from "@/lib/community-rules";

export async function getCommunityBySlug(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) return null;
  const [community] = await db
    .select()
    .from(communities)
    .where(eq(communities.slug, slug))
    .limit(1);
  return community || null;
}

export async function isCommunityMemberEligible(
  communityId: string,
  memberId: string,
  email: string
): Promise<boolean> {
  const [membership] = await db
    .select({
      status: communityMemberships.status,
      answers: communityMemberships.answersJson,
      rules: communities.rulesJson
    })
    .from(communityMemberships)
    .innerJoin(communities, eq(communityMemberships.communityId, communities.id))
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.memberId, memberId)
      )
    )
    .limit(1);
  return Boolean(
    membership?.status === "active" &&
      evaluateCommunityRules(membership.rules, email, membership.answers).allowed
  );
}
