"use server";

import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  communityMemberships,
  electionNotifications,
  electionEligibility,
  elections,
  exportsTable,
  manualVoteCounts,
  members,
  staffRoles,
  votes
} from "@/db/schema";
import { assertAdminRoleAccess, getAdminActorEmail, getElectionActor } from "@/lib/admin";
import { isElectionOpen } from "@/lib/election";
import { parseBallotJson } from "@/lib/ballot";
import { parseMemberCsv } from "@/lib/csv";
import { normalizeEmail } from "@/lib/email";
import { deconflictImportRows } from "@/lib/imports";
import {
  dispatchOpenElectionNotifications,
  queueOpenElectionNotifications
} from "@/lib/notifications";
import { createAndUploadResultsBundle } from "@/lib/results-export";

const createElectionSchema = z.object({
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(10000).optional(),
  ballotVersion: z.string().trim().min(1).max(50),
  ballotJson: z.string().trim().min(2),
  opensAt: z.string().trim().optional(),
  closesAt: z.string().trim().optional()
});

export async function createElectionAction(formData: FormData) {
  const communityId = z.uuid().parse(formData.get("communityId"));
  const actor = await getAdminActorEmail(communityId);

  const parsed = createElectionSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    ballotVersion: formData.get("ballotVersion"),
    ballotJson: formData.get("ballotJson"),
    opensAt: formData.get("opensAt") || undefined,
    closesAt: formData.get("closesAt") || undefined
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid_election_input");
  }

  let ballot;
  try {
    ballot = parseBallotJson(parsed.data.ballotJson);
  } catch {
    redirect("/admin?error=invalid_ballot_json");
  }

  const opensAt = parsed.data.opensAt ? new Date(`${parsed.data.opensAt}Z`) : null;
  const closesAt = parsed.data.closesAt ? new Date(`${parsed.data.closesAt}Z`) : null;

  if (
    (opensAt && Number.isNaN(opensAt.getTime())) ||
    (closesAt && Number.isNaN(closesAt.getTime())) ||
    (opensAt && closesAt && closesAt <= opensAt)
  ) {
    redirect("/admin?error=invalid_schedule");
  }

  const [created] = await db
    .insert(elections)
    .values({
      communityId,
      name: parsed.data.name,
      description: parsed.data.description,
      ballotVersion: parsed.data.ballotVersion,
      ballotJson: ballot,
      status: "draft",
      opensAt,
      closesAt
    })
    .returning({ id: elections.id, name: elections.name });

  await db.insert(auditEvents).values({
    electionId: created.id,
    actor,
    action: "election.created",
    detailsJson: {
      electionName: created.name
    }
  });

  try {
    await queueOpenElectionNotifications({
      electionId: created.id,
      actor
    });
  } catch {
    redirect(`/admin/elections/${created.id}?error=notification_failed`);
  }

  redirect(`/admin/elections/${created.id}?created=1`);
}

export async function bulkImportMembersAction(formData: FormData) {
  const communityId = z.uuid().parse(formData.get("communityId"));
  const actor = await getAdminActorEmail(communityId);

  const file = formData.get("membersCsv");
  if (!(file instanceof File) || file.size === 0 || file.size > 500_000) {
    redirect("/admin?error=missing_csv");
  }

  const csvText = await file.text();

  let parsedRows;
  try {
    parsedRows = parseMemberCsv(csvText);
  } catch {
    redirect("/admin?error=invalid_csv");
  }

  if (
    parsedRows.length > 2000 ||
    parsedRows.some(
      (row) =>
        !z
          .object({
            fullName: z.string().trim().min(2).max(200),
            email: z.string().trim().email().max(320)
          })
          .safeParse(row).success
    )
  )
    redirect("/admin?error=invalid_csv");
  const rows = deconflictImportRows(
    parsedRows.map((row) => ({ fullName: row.fullName, email: row.email }))
  );

  if (rows.length === 0) {
    redirect("/admin?error=empty_csv");
  }

  let importedCount = 0;

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const email = normalizeEmail(row.email);

      const [member] = await tx
        .insert(members)
        .values({
          fullName: row.fullName,
          email,
          verificationMethod: "admin_import"
        })
        .onConflictDoUpdate({
          target: members.email,
          set: {
            email
          }
        })
        .returning({ id: members.id, email: members.email });

      await tx
        .insert(communityMemberships)
        .values({ communityId, memberId: member.id })
        .onConflictDoNothing();
      importedCount += 1;

      await tx.insert(auditEvents).values({
        electionId: null,
        actor,
        action: "member.imported",
        detailsJson: {
          memberId: member.id,
          email: member.email,
          source: "csv",
          mergedCount: row.mergedCount
        }
      });
    }

    await tx.insert(auditEvents).values({
      electionId: null,
      actor,
      action: "members.bulk_import_completed",
      detailsJson: {
        importedCount,
        deconflictedRows: rows.length
      }
    });
  });

  redirect(`/admin/communities/${communityId}?imported=${importedCount}`);
}

const staffRoleSchema = z.object({
  email: z.string().email().max(320),
  role: z.enum(["admin", "election_manager"])
});

export async function upsertStaffRoleAction(formData: FormData) {
  const communityId = z.uuid().parse(formData.get("communityId"));
  await assertAdminRoleAccess(communityId);
  const actor = await getAdminActorEmail(communityId);

  const parsed = staffRoleSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid_staff_role_input");
  }

  const email = normalizeEmail(parsed.data.email);

  await db
    .insert(staffRoles)
    .values({
      communityId,
      email,
      role: parsed.data.role,
      addedBy: actor
    })
    .onConflictDoUpdate({
      target: [staffRoles.communityId, staffRoles.email],
      set: {
        role: parsed.data.role,
        addedBy: actor
      }
    });

  await db.insert(auditEvents).values({
    electionId: null,
    actor,
    action: "staff_role.upserted",
    detailsJson: {
      email,
      role: parsed.data.role
    }
  });

  redirect(`/admin/communities/${communityId}?saved=1`);
}

const electionUpdateSchema = z.object({
  electionId: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "open", "closed", "archived"]),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(10000).optional(),
  ballotVersion: z.string().trim().min(1).max(50),
  ballotJson: z.string().trim().min(2),
  opensAt: z.string().trim().optional(),
  closesAt: z.string().trim().optional()
});

export async function updateElectionAction(formData: FormData) {
  const targetElectionId = z.uuid().parse(formData.get("electionId"));
  const actor = (await getElectionActor(targetElectionId)).email;

  const parsed = electionUpdateSchema.safeParse({
    electionId: formData.get("electionId"),
    status: formData.get("status"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    ballotVersion: formData.get("ballotVersion"),
    ballotJson: formData.get("ballotJson"),
    opensAt: formData.get("opensAt") || undefined,
    closesAt: formData.get("closesAt") || undefined
  });

  if (!parsed.success) {
    redirect(`/admin?error=invalid_update_input`);
  }

  const [existing] = await db
    .select({
      id: elections.id,
      status: elections.status,
      name: elections.name,
      description: elections.description,
      ballotVersion: elections.ballotVersion,
      ballotJson: elections.ballotJson,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt
    })
    .from(elections)
    .where(eq(elections.id, parsed.data.electionId))
    .limit(1);

  if (!existing) {
    redirect(`/admin/elections/${parsed.data.electionId}?error=election_not_found`);
  }

  let ballot = existing.ballotJson;
  let name = existing.name;
  let description = existing.description;
  let ballotVersion = existing.ballotVersion;
  let status = existing.status;
  let effectiveOpensAt = existing.opensAt;
  let effectiveClosesAt = existing.closesAt;

  if (
    existing.status === "draft" ||
    (existing.status === "scheduled" && existing.opensAt !== null && existing.opensAt > new Date())
  ) {
    const opensAt = parsed.data.opensAt ? new Date(`${parsed.data.opensAt}Z`) : null;
    const closesAt = parsed.data.closesAt ? new Date(`${parsed.data.closesAt}Z`) : null;

    if (
      (opensAt && Number.isNaN(opensAt.getTime())) ||
      (closesAt && Number.isNaN(closesAt.getTime())) ||
      (opensAt && closesAt && closesAt <= opensAt)
    ) {
      redirect(`/admin/elections/${parsed.data.electionId}?error=invalid_schedule`);
    }

    try {
      ballot = parseBallotJson(parsed.data.ballotJson);
    } catch {
      redirect(`/admin/elections/${parsed.data.electionId}?error=invalid_ballot_json`);
    }

    name = parsed.data.name;
    description = parsed.data.description ?? null;
    ballotVersion = parsed.data.ballotVersion;
    if (parsed.data.status === "scheduled" && !opensAt)
      redirect(`/admin/elections/${parsed.data.electionId}?error=invalid_schedule`);
    status = parsed.data.status;
    effectiveOpensAt = opensAt;
    effectiveClosesAt = closesAt;
  } else if (existing.status === "open" || existing.status === "scheduled") {
    if (!["open", "closed", "scheduled", "archived"].includes(parsed.data.status)) {
      redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);
    }
    description = parsed.data.description ?? null;
    status = parsed.data.status;
  } else if (existing.status === "closed") {
    if (!["open", "closed", "archived"].includes(parsed.data.status)) {
      redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);
    }
    status = parsed.data.status;
  } else {
    redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);
  }

  const updatedElection = await db
    .update(elections)
    .set({
      name,
      description,
      status,
      ballotVersion,
      ballotJson: ballot,
      opensAt: effectiveOpensAt,
      closesAt: effectiveClosesAt
    })
    .where(
      and(
        eq(elections.id, parsed.data.electionId),
        eq(elections.status, existing.status),
        existing.status === "scheduled" && existing.opensAt && existing.opensAt > new Date()
          ? gt(elections.opensAt, new Date())
          : undefined
      )
    )
    .returning({ id: elections.id });
  if (!updatedElection.length)
    redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);

  await db.insert(auditEvents).values({
    electionId: parsed.data.electionId,
    actor,
    action: "election.updated",
    detailsJson: {
      status,
      ballotVersion
    }
  });

  try {
    await queueOpenElectionNotifications({
      electionId: parsed.data.electionId,
      actor
    });
  } catch {
    redirect(`/admin/elections/${parsed.data.electionId}?error=notification_failed`);
  }

  redirect(`/admin/elections/${parsed.data.electionId}?saved=1`);
}

export async function setEligibilityAction(formData: FormData) {
  const targetElectionId = z.uuid().parse(formData.get("electionId"));
  const actor = (await getElectionActor(targetElectionId)).email;

  const electionId = z.string().uuid().parse(formData.get("electionId"));
  const memberEmail = normalizeEmail(z.string().email().parse(formData.get("memberEmail")));
  const eligible = z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .parse(formData.get("eligible"));

  await db.transaction(async (tx) => {
    const [election] = await tx
      .select({ id: elections.id, status: elections.status, communityId: elections.communityId })
      .from(elections)
      .where(eq(elections.id, electionId))
      .limit(1)
      .for("update");

    if (!election) {
      redirect(`/admin/elections/${electionId}?error=election_not_found`);
    }

    if (election.status === "closed" || election.status === "archived") {
      redirect(`/admin/elections/${electionId}?error=election_locked`);
    }

    const [member] = await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.email, memberEmail))
      .limit(1);
    if (!member) {
      redirect(`/admin/elections/${electionId}?error=member_not_found`);
    }

    const [membership] = await tx
      .select({ id: communityMemberships.id })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, election.communityId),
          eq(communityMemberships.memberId, member.id)
        )
      )
      .limit(1);
    if (!membership) redirect(`/admin/elections/${electionId}?error=member_not_found`);

    await tx
      .insert(electionEligibility)
      .values({
        electionId,
        memberId: member.id,
        eligible,
        includedBy: actor
      })
      .onConflictDoUpdate({
        target: [electionEligibility.electionId, electionEligibility.memberId],
        set: {
          eligible,
          includedBy: actor
        }
      });

    await tx.insert(auditEvents).values({
      electionId,
      actor,
      action: "election.eligibility_set",
      detailsJson: {
        memberId: member.id,
        eligible
      }
    });
  });

  redirect(`/admin/elections/${electionId}?eligibility_saved=1`);
}

const manualCountsSchema = z.object({
  electionId: z.string().uuid()
});

export async function setManualVoteCountsAction(formData: FormData) {
  const targetElectionId = z.uuid().parse(formData.get("electionId"));
  const actor = (await getElectionActor(targetElectionId)).email;

  const parsed = manualCountsSchema.safeParse({
    electionId: formData.get("electionId")
  });

  if (!parsed.success) {
    redirect(`/admin?error=invalid_update_input`);
  }

  const [election] = await db
    .select({
      id: elections.id,
      status: elections.status,
      opensAt: elections.opensAt,
      closesAt: elections.closesAt,
      ballotJson: elections.ballotJson
    })
    .from(elections)
    .where(eq(elections.id, parsed.data.electionId))
    .limit(1);

  if (!election) {
    redirect(`/admin/elections/${parsed.data.electionId}?error=election_not_found`);
  }

  if (!isElectionOpen(election) && election.status !== "closed") {
    redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);
  }

  let ballot;
  try {
    ballot = parseBallotJson(JSON.stringify(election.ballotJson));
  } catch {
    redirect(`/admin/elections/${parsed.data.electionId}?error=invalid_ballot_json`);
  }

  const counts: Array<{ choiceId: string; count: number }> = [];

  for (const choice of ballot.choices) {
    const raw = formData.get(`manualCount:${choice.id}`);
    if (raw === null || raw === "") {
      counts.push({ choiceId: choice.id, count: 0 });
      continue;
    }
    const parsedCount = Number(raw);
    if (!Number.isInteger(parsedCount) || parsedCount < 0 || parsedCount > 2147483647) {
      redirect(`/admin/elections/${parsed.data.electionId}?error=invalid_manual_counts`);
    }
    counts.push({ choiceId: choice.id, count: parsedCount });
  }

  await db.transaction(async (tx) => {
    for (const entry of counts) {
      await tx
        .insert(manualVoteCounts)
        .values({
          electionId: parsed.data.electionId,
          choiceId: entry.choiceId,
          count: entry.count,
          updatedBy: actor,
          updatedAt: new Date()
        })
        .onConflictDoUpdate({
          target: [manualVoteCounts.electionId, manualVoteCounts.choiceId],
          set: {
            count: entry.count,
            updatedBy: actor,
            updatedAt: new Date()
          }
        });
    }

    await tx.insert(auditEvents).values({
      electionId: parsed.data.electionId,
      actor,
      action: "election.manual_counts_updated",
      detailsJson: {
        choiceIds: counts.map((entry) => entry.choiceId),
        totalManualVotes: counts.reduce((sum, entry) => sum + entry.count, 0)
      }
    });
  });

  redirect(`/admin/elections/${parsed.data.electionId}?manual_saved=1`);
}

export async function exportElectionResultsAction(formData: FormData) {
  const targetElectionId = z.uuid().parse(formData.get("electionId"));
  const actor = (await getElectionActor(targetElectionId)).email;
  const electionId = z.string().uuid().parse(formData.get("electionId"));

  const [election] = await db
    .select({ id: elections.id, name: elections.name, ballotJson: elections.ballotJson })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);

  if (!election) {
    redirect(`/admin/elections/${electionId}?error=election_not_found`);
  }

  const rows = await db
    .select({
      memberId: members.id,
      fullName: members.fullName,
      email: members.email,
      ballotVersion: votes.ballotVersion,
      votePayloadJson: votes.votePayloadJson,
      castAt: votes.castAt
    })
    .from(votes)
    .innerJoin(members, eq(votes.memberId, members.id))
    .where(eq(votes.electionId, electionId))
    .orderBy(asc(votes.castAt));

  const manualCounts = await db
    .select({ choiceId: manualVoteCounts.choiceId, count: manualVoteCounts.count })
    .from(manualVoteCounts)
    .where(eq(manualVoteCounts.electionId, electionId));
  const choices = parseBallotJson(JSON.stringify(election.ballotJson)).choices;

  let exportBundle: Awaited<ReturnType<typeof createAndUploadResultsBundle>>;
  try {
    exportBundle = await createAndUploadResultsBundle({
      electionId,
      electionName: election.name,
      choices,
      manualCounts,
      rows
    });
  } catch {
    redirect(`/admin/elections/${electionId}?error=export_failed`);
  }

  await db.insert(exportsTable).values({
    electionId,
    gcsPath: exportBundle.gcsPath,
    sha256: exportBundle.bundleSha256
  });

  await db.insert(auditEvents).values({
    electionId,
    actor,
    action: "election.results_exported",
    detailsJson: {
      gcsPath: exportBundle.gcsPath,
      sha256: exportBundle.bundleSha256,
      voteCount: rows.length
    }
  });

  redirect(`/admin/elections/${electionId}?exported=1`);
}

export async function retryElectionNotificationsAction(formData: FormData) {
  const electionId = z.uuid().parse(formData.get("electionId"));
  const actor = await getElectionActor(electionId);
  const includeUncertain = formData.get("confirmedUnsent") === "on";
  await db.transaction(async (tx) => {
    await tx
      .update(electionNotifications)
      .set({ status: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null })
      .where(
        and(
          eq(electionNotifications.electionId, electionId),
          inArray(
            electionNotifications.status,
            includeUncertain ? ["failed", "uncertain"] : ["failed"]
          )
        )
      );
    await tx.insert(auditEvents).values({
      electionId,
      actor: actor.email,
      action: "election.notification_retry_requested",
      detailsJson: { includeUncertain }
    });
  });
  try {
    await dispatchOpenElectionNotifications({ electionId, actor: actor.email });
  } catch {
    redirect(`/admin/elections/${electionId}?error=notification_failed`);
  }
  redirect(`/admin/elections/${electionId}?saved=1`);
}
