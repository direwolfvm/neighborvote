"use server";

import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents,
  electionEligibility,
  elections,
  exportsTable,
  manualVoteCounts,
  members,
  votes
} from "@/db/schema";
import { getAdminActorEmail } from "@/lib/admin";
import { parseBallotJson } from "@/lib/ballot";
import { parseMemberCsv } from "@/lib/csv";
import { normalizeEmail } from "@/lib/email";
import { deconflictImportRows } from "@/lib/imports";
import { dispatchOpenElectionNotifications } from "@/lib/notifications";
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
  const actor = await getAdminActorEmail();

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

  const opensAt = parsed.data.opensAt ? new Date(parsed.data.opensAt) : null;
  const closesAt = parsed.data.closesAt ? new Date(parsed.data.closesAt) : null;

  if ((opensAt && Number.isNaN(opensAt.getTime())) || (closesAt && Number.isNaN(closesAt.getTime()))) {
    redirect("/admin?error=invalid_schedule");
  }

  const [created] = await db
    .insert(elections)
    .values({
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
    await dispatchOpenElectionNotifications({
      electionId: created.id,
      actor
    });
  } catch {
    redirect(`/admin/elections/${created.id}?error=notification_failed`);
  }

  redirect(`/admin/elections/${created.id}?created=1`);
}

export async function bulkImportMembersAction(formData: FormData) {
  const actor = await getAdminActorEmail();

  const file = formData.get("membersCsv");
  if (!(file instanceof File) || file.size === 0) {
    redirect("/admin?error=missing_csv");
  }

  const csvText = await file.text();

  let parsedRows;
  try {
    parsedRows = parseMemberCsv(csvText);
  } catch {
    redirect("/admin?error=invalid_csv");
  }

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
            fullName: row.fullName
          }
        })
        .returning({ id: members.id, email: members.email });

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

  redirect(`/admin?imported=${importedCount}`);
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
  const actor = await getAdminActorEmail();

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

  if (existing.status === "draft" || existing.status === "scheduled") {
    const opensAt = parsed.data.opensAt ? new Date(parsed.data.opensAt) : null;
    const closesAt = parsed.data.closesAt ? new Date(parsed.data.closesAt) : null;

    if ((opensAt && Number.isNaN(opensAt.getTime())) || (closesAt && Number.isNaN(closesAt.getTime()))) {
      redirect(`/admin/elections/${parsed.data.electionId}?error=invalid_schedule`);
    }

    try {
      ballot = parseBallotJson(parsed.data.ballotJson);
    } catch {
      redirect(`/admin/elections/${parsed.data.electionId}?error=invalid_ballot_json`);
    }

    name = parsed.data.name;
    description = parsed.data.description;
    ballotVersion = parsed.data.ballotVersion;
    status = parsed.data.status;
    effectiveOpensAt = opensAt;
    effectiveClosesAt = closesAt;
  } else if (existing.status === "open") {
    if (!["open", "closed"].includes(parsed.data.status)) {
      redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);
    }
    description = parsed.data.description;
    status = parsed.data.status;
  } else if (existing.status === "closed") {
    if (!["open", "closed"].includes(parsed.data.status)) {
      redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);
    }
    status = parsed.data.status;
  } else {
    redirect(`/admin/elections/${parsed.data.electionId}?error=election_locked`);
  }

  await db
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
    .where(eq(elections.id, parsed.data.electionId));

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
    await dispatchOpenElectionNotifications({
      electionId: parsed.data.electionId,
      actor
    });
  } catch {
    redirect(`/admin/elections/${parsed.data.electionId}?error=notification_failed`);
  }

  redirect(`/admin/elections/${parsed.data.electionId}?saved=1`);
}

export async function setEligibilityAction(formData: FormData) {
  const actor = await getAdminActorEmail();

  const electionId = z.string().uuid().parse(formData.get("electionId"));
  const memberEmail = normalizeEmail(z.string().email().parse(formData.get("memberEmail")));
  const eligible = z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .parse(formData.get("eligible"));

  const [election] = await db
    .select({ id: elections.id, status: elections.status })
    .from(elections)
    .where(eq(elections.id, electionId))
    .limit(1);

  if (!election) {
    redirect(`/admin/elections/${electionId}?error=election_not_found`);
  }

  if (election.status === "closed" || election.status === "archived") {
    redirect(`/admin/elections/${electionId}?error=election_locked`);
  }

  const [member] = await db.select({ id: members.id }).from(members).where(eq(members.email, memberEmail)).limit(1);
  if (!member) {
    redirect(`/admin/elections/${electionId}?error=member_not_found`);
  }

  await db
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

  await db.insert(auditEvents).values({
    electionId,
    actor,
    action: "election.eligibility_set",
    detailsJson: {
      memberId: member.id,
      eligible
    }
  });

  redirect(`/admin/elections/${electionId}?eligibility_saved=1`);
}

const manualCountsSchema = z.object({
  electionId: z.string().uuid()
});

export async function setManualVoteCountsAction(formData: FormData) {
  const actor = await getAdminActorEmail();

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
      ballotJson: elections.ballotJson
    })
    .from(elections)
    .where(eq(elections.id, parsed.data.electionId))
    .limit(1);

  if (!election) {
    redirect(`/admin/elections/${parsed.data.electionId}?error=election_not_found`);
  }

  if (election.status !== "open" && election.status !== "closed") {
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
    if (!Number.isInteger(parsedCount) || parsedCount < 0) {
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
  const actor = await getAdminActorEmail();
  const electionId = z.string().uuid().parse(formData.get("electionId"));

  const [election] = await db
    .select({ id: elections.id, name: elections.name })
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

  let exportBundle: Awaited<ReturnType<typeof createAndUploadResultsBundle>>;
  try {
    exportBundle = await createAndUploadResultsBundle({
      electionId,
      electionName: election.name,
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
