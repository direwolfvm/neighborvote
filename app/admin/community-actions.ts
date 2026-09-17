"use server";
import { and, eq } from "drizzle-orm";
import { redirect, unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import { auditEvents, communities, communityMemberships, staffRoles } from "@/db/schema";
import { getAdminActor } from "@/lib/admin";
import { communityRulesSchema } from "@/lib/community-rules";
import { parseBoundary } from "@/lib/boundary";

export async function createCommunityAction(formData: FormData) {
  const actor = await getAdminActor();
  if (actor.source !== "env")
    throw new Error("Only platform administrators can create communities.");
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(200),
      slug: z
        .string()
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
        .max(80)
    })
    .safeParse({ name: formData.get("name"), slug: formData.get("slug") });
  if (!parsed.success) redirect("/admin?error=invalid_community");
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      const [community] = await tx
        .insert(communities)
        .values(parsed.data)
        .returning({ id: communities.id });
      await tx.insert(auditEvents).values({
        actor: actor.email,
        action: "community.created",
        detailsJson: { communityId: community.id }
      });
      return community.id;
    });
  } catch {
    redirect("/admin?error=community_create_failed");
  }
  redirect(`/admin/communities/${id}`);
}

const textList = (data: FormData, key: string) =>
  String(data.get(key) || "")
    .split(/[\n,]/)
    .map((v) => v.trim())
    .filter(Boolean);
export async function saveCommunityAction(formData: FormData) {
  const id = z.uuid().parse(formData.get("communityId"));
  const actor = await getAdminActor(id);
  const destination = `/admin/communities/${id}`;
  try {
    const [existing] = await db.select().from(communities).where(eq(communities.id, id)).limit(1);
    if (!existing) redirect("/admin");
    const existingRules = communityRulesSchema.parse(existing.rulesJson);
    let boundary = existingRules.boundary;
    const upload = formData.get("boundaryFile");
    if (formData.get("removeBoundary") === "on") boundary = null;
    if (upload instanceof File && upload.size > 0) {
      if (upload.size > 500_000) throw new Error("Boundary too large");
      boundary = parseBoundary(JSON.parse(await upload.text()));
    }
    // Stable IDs are preserved while labels are unchanged. Changed statements require renewed attestation.
    const labels = String(formData.get("attestations") || "")
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    const { sha256Hex } = await import("@/lib/crypto");
    const rules = communityRulesSchema.parse({
      registrationOpen: formData.get("registrationOpen") === "on",
      boundary,
      allowedPostalCodes: textList(formData, "allowedPostalCodes"),
      blockedEmails: textList(formData, "blockedEmails").map((v) =>
        z.email().parse(v).toLowerCase()
      ),
      blockedEmailDomains: textList(formData, "blockedEmailDomains").map((v) =>
        z
          .string()
          .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i)
          .parse(v)
          .toLowerCase()
      ),
      requiredAttestations: labels.map((label) => ({
        id:
          existingRules.requiredAttestations.find((item) => item.label === label)?.id ||
          `statement_${sha256Hex(label).slice(0, 20)}`,
        label
      }))
    });
    const details = z
      .object({
        name: z.string().trim().min(2).max(200),
        description: z.string().max(10000),
        contactEmail: z.union([z.email(), z.literal("")])
      })
      .parse({
        name: formData.get("name"),
        description: formData.get("description") || "",
        contactEmail: String(formData.get("contactEmail") || "").trim()
      });
    await db.transaction(async (tx) => {
      await tx
        .update(communities)
        .set({
          name: details.name,
          description: details.description,
          contactEmail: details.contactEmail || null,
          rulesJson: rules
        })
        .where(eq(communities.id, id));
      await tx.insert(auditEvents).values({
        actor: actor.email,
        action: "community.settings_updated",
        detailsJson: {
          communityId: id,
          hasBoundary: Boolean(boundary),
          attestationCount: labels.length
        }
      });
    });
  } catch (error) {
    unstable_rethrow(error);
    redirect(`${destination}?error=invalid_settings`);
  }
  redirect(`${destination}?saved=1`);
}

export async function setCommunityMembershipAction(formData: FormData) {
  const communityId = z.uuid().parse(formData.get("communityId"));
  const memberId = z.uuid().parse(formData.get("memberId"));
  const status = z.enum(["active", "excluded"]).parse(formData.get("status"));
  const actor = await getAdminActor(communityId);
  await db.transaction(async (tx) => {
    // Synchronize exclusions with registration verification and vote checks on the community row.
    await tx
      .select({ id: communities.id })
      .from(communities)
      .where(eq(communities.id, communityId))
      .for("update");
    await tx
      .update(communityMemberships)
      .set({ status })
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.memberId, memberId)
        )
      );
    await tx.insert(auditEvents).values({
      actor: actor.email,
      action: "community.membership_status_changed",
      detailsJson: { communityId, memberId, status }
    });
  });
  redirect(`/admin/communities/${communityId}?saved=1`);
}

export async function removeCommunityStaffAction(formData: FormData) {
  const communityId = z.uuid().parse(formData.get("communityId"));
  const email = z.email().parse(formData.get("email")).toLowerCase();
  const actor = await getAdminActor(communityId);
  if (actor.role !== "admin" || (actor.source === "db" && actor.email === email))
    throw new Error("Another community administrator must remove your access.");
  await db.transaction(async (tx) => {
    await tx
      .delete(staffRoles)
      .where(and(eq(staffRoles.communityId, communityId), eq(staffRoles.email, email)));
    await tx
      .insert(auditEvents)
      .values({
        actor: actor.email,
        action: "community.staff_removed",
        detailsJson: { communityId, email }
      });
  });
  redirect(`/admin/communities/${communityId}?saved=1`);
}
