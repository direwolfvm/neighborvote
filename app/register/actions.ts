"use server";

import { and, desc, eq } from "drizzle-orm";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  members,
  memberVerificationSessions,
  communityMemberships
} from "@/db/schema";
import { generateOpaqueToken, sha256Hex } from "@/lib/crypto";
import { normalizeEmail } from "@/lib/email";
import { sendVerificationEmail } from "@/lib/mailer";
import { allowEmailRequest } from "@/lib/rate-limit";
import { getCommunityBySlug } from "@/lib/community";
import {
  communityRulesSchema,
  evaluateCommunityRules,
  type RegistrationAnswers
} from "@/lib/community-rules";
import { addressSchema, AddressScreeningError, geocodeAddress } from "@/lib/geocoding";

const emailSchema = z.string().trim().email().max(320);
const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(80);

async function issueVerification(email: string, communityId: string, answers: RegistrationAnswers) {
  const [member] = await db
    .select({ id: members.id, status: members.status })
    .from(members)
    .where(eq(members.email, email))
    .limit(1);
  if (!member || member.status === "inactive") return;
  const [membership] = await db
    .select({ status: communityMemberships.status })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.memberId, member.id),
        eq(communityMemberships.communityId, communityId)
      )
    )
    .limit(1);
  if (membership?.status === "excluded") return;
  const token = generateOpaqueToken();
  await db.transaction(async (tx) => {
    await tx
      .insert(memberVerificationSessions)
      .values({
        memberId: member.id,
        communityId,
        answersJson: answers,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(Date.now() + 86_400_000)
      });
    await tx
      .insert(auditEvents)
      .values({
        actor: email,
        action: "member.verification_requested",
        detailsJson: { memberId: member.id, communityId }
      });
  });
  await sendVerificationEmail(email, token);
}

export async function registerMemberAction(formData: FormData) {
  const parsed = z
    .object({
      fullName: z.string().trim().min(2).max(200),
      email: emailSchema,
      community: slugSchema
    })
    .safeParse({
      fullName: formData.get("fullName"),
      email: formData.get("email"),
      community: formData.get("community")
    });
  if (!parsed.success) redirect("/register?error=invalid_input");
  const destination = `/register?community=${parsed.data.community}`;
  const email = normalizeEmail(parsed.data.email);
  try {
    if (!(await allowEmailRequest(email))) redirect(`${destination}&error=rate_limited`);
    const community = await getCommunityBySlug(parsed.data.community);
    if (!community) redirect("/register?error=community_not_found");
    const rules = communityRulesSchema.parse(community.rulesJson);
    const answers: RegistrationAnswers = {
      postalCode: String(formData.get("postalCode") || "")
        .trim()
        .slice(0, 20),
      attestations: formData.getAll("attestations").map(String).slice(0, 20)
    };
    // Check non-geographic conditions before calling the geocoder.
    const preliminary = evaluateCommunityRules({ ...rules, boundary: null }, email, answers, true);
    if (!preliminary.allowed)
      redirect(
        `${destination}&error=not_eligible&reason=${encodeURIComponent(preliminary.reason!)}`
      );
    if (rules.boundary) {
      const address = addressSchema.safeParse({
        street: formData.get("street"),
        city: formData.get("city"),
        state: formData.get("state"),
        postalCode: answers.postalCode
      });
      if (!address.success) redirect(`${destination}&error=invalid_address`);
      answers.address = address.data;
      answers.geocode = await geocodeAddress(address.data);
    }
    const eligibility = evaluateCommunityRules(rules, email, answers, true);
    if (!eligibility.allowed)
      redirect(
        `${destination}&error=not_eligible&reason=${encodeURIComponent(eligibility.reason!)}`
      );
    await db
      .insert(members)
      .values({ fullName: parsed.data.fullName, email })
      .onConflictDoNothing({ target: members.email });
    await issueVerification(email, community.id, answers);
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AddressScreeningError) redirect(`${destination}&error=${error.code}`);
    redirect(`${destination}&error=send_failed`);
  }
  redirect(`${destination}&sent=1`);
}

export async function resendVerificationAction(formData: FormData) {
  const parsed = z
    .object({ email: emailSchema, community: slugSchema })
    .safeParse({ email: formData.get("email"), community: formData.get("community") });
  if (!parsed.success) redirect("/register?error=invalid_input");
  const destination = `/register?community=${parsed.data.community}`;
  const email = normalizeEmail(parsed.data.email);
  try {
    if (!(await allowEmailRequest(email))) redirect(`${destination}&error=rate_limited`);
    const community = await getCommunityBySlug(parsed.data.community);
    if (!community) redirect("/register?error=community_not_found");
    const [latest] = await db
      .select({ answers: memberVerificationSessions.answersJson })
      .from(memberVerificationSessions)
      .innerJoin(members, eq(members.id, memberVerificationSessions.memberId))
      .where(
        and(eq(members.email, email), eq(memberVerificationSessions.communityId, community.id))
      )
      .orderBy(desc(memberVerificationSessions.issuedAt))
      .limit(1);
    if (latest && evaluateCommunityRules(community.rulesJson, email, latest.answers, true).allowed)
      await issueVerification(email, community.id, latest.answers as RegistrationAnswers);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`${destination}&error=send_failed`);
  }
  redirect(`${destination}&sent=1`);
}
