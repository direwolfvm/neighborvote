import { and, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, electionNotifications, elections } from "@/db/schema";
import { MailDeliveryError, sendTemplatedEmail } from "@/lib/mailer";
import { evaluateCommunityRules } from "@/lib/community-rules";
import { appBaseUrl } from "@/lib/urls";

/** Snapshot recipients once. A unique row per election/member prevents overlapping jobs from duplicating work. */
export async function queueOpenElectionNotifications(options?: {
  electionId?: string;
  actor?: string;
}) {
  const now = new Date();
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: elections.id })
      .from(elections)
      .where(
        and(
          or(
            eq(elections.status, "open"),
            and(eq(elections.status, "scheduled"), lte(elections.opensAt, now))
          ),
          isNull(elections.notificationSentAt),
          isNull(elections.notificationQueuedAt),
          or(isNull(elections.opensAt), lte(elections.opensAt, now)),
          or(isNull(elections.closesAt), gt(elections.closesAt, now)),
          options?.electionId ? eq(elections.id, options.electionId) : undefined
        )
      )
      .limit(20)
      .for("update", { skipLocked: true });
    for (const election of due) {
      await tx.execute(sql`INSERT INTO election_notifications (election_id, member_id)
        SELECT ${election.id}, m.id FROM members m JOIN community_memberships cm ON cm.member_id = m.id
        JOIN elections el ON el.community_id = cm.community_id AND el.id = ${election.id}
        WHERE cm.status = 'active' AND m.status = 'verified'
        AND NOT EXISTS (SELECT 1 FROM election_eligibility e WHERE e.election_id = ${election.id} AND e.member_id = m.id AND NOT e.eligible)
        ON CONFLICT (election_id, member_id) DO NOTHING`);
      await tx
        .update(elections)
        .set({ notificationQueuedAt: now })
        .where(eq(elections.id, election.id));
      await tx
        .insert(auditEvents)
        .values({
          electionId: election.id,
          actor: options?.actor || "system",
          action: "election.notifications_queued",
          detailsJson: {}
        });
    }
    return due.length;
  });
}

export async function dispatchOpenElectionNotifications(options?: {
  electionId?: string;
  actor?: string;
}) {
  await queueOpenElectionNotifications(options);
  await db.execute(
    sql`UPDATE election_notifications n SET status = 'skipped' FROM elections e WHERE n.election_id = e.id AND n.status IN ('pending','failed') AND (e.status IN ('closed','archived') OR e.closes_at <= now())`
  );
  // A crashed worker may have sent mail. Never automatically resend an ambiguous delivery.
  await db.execute(sql`UPDATE election_notifications SET status = 'uncertain', last_error = 'worker_interrupted'
    WHERE status = 'sending' AND attempted_at < now() - interval '5 minutes'`);
  await db.execute(sql`DELETE FROM email_rate_limits WHERE expires_at < now() - interval '1 hour'`);
  let sent = 0;
  let failed = 0;
  // Bound each scheduler run to 20 messages and < 5 minutes at the provider timeout.
  for (let i = 0; i < 20; i++) {
    const claimed = await db.execute(sql`
      UPDATE election_notifications SET status = 'sending', attempts = attempts + 1, attempted_at = now()
      WHERE id = (SELECT n.id FROM election_notifications n JOIN elections e ON e.id = n.election_id
        WHERE ${options?.electionId ? sql`n.election_id = ${options.electionId}` : sql`true`} AND n.status IN ('pending', 'failed') AND n.attempts < 5 AND n.next_attempt_at <= now()
          AND e.status IN ('open', 'scheduled') AND (e.opens_at IS NULL OR e.opens_at <= now())
          AND (e.closes_at IS NULL OR e.closes_at > now())
        ORDER BY n.next_attempt_at, n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1)
      RETURNING id, election_id, member_id, attempts`);
    const row = claimed.rows[0] as
      | { id: string; election_id: string; member_id: string; attempts: number }
      | undefined;
    if (!row) break;
    const context =
      await db.execute(sql`SELECT m.email, e.name, c.rules_json, cm.answers_json FROM members m CROSS JOIN elections e
      JOIN communities c ON c.id = e.community_id
      JOIN community_memberships cm ON cm.community_id = c.id
      WHERE cm.member_id = m.id AND cm.status = 'active' AND m.id = ${row.member_id} AND e.id = ${row.election_id} AND m.status = 'verified'
      AND NOT EXISTS (SELECT 1 FROM election_eligibility x WHERE x.election_id = e.id AND x.member_id = m.id AND NOT x.eligible)`);
    const recipient = context.rows[0] as
      | { email: string; name: string; rules_json: unknown; answers_json: unknown }
      | undefined;
    if (
      !recipient ||
      !evaluateCommunityRules(recipient.rules_json, recipient.email, recipient.answers_json).allowed
    ) {
      await db
        .update(electionNotifications)
        .set({ status: "skipped" })
        .where(eq(electionNotifications.id, row.id));
      continue;
    }
    let receipt;
    try {
      receipt = await sendTemplatedEmail(
        recipient.email,
        "election-open",
        new URL(`/elections/${row.election_id}`, appBaseUrl()).toString(),
        recipient.name
      );
    } catch (error) {
      const ambiguous = error instanceof MailDeliveryError && error.status === null;
      await db
        .update(electionNotifications)
        .set({
          status: ambiguous ? "uncertain" : "failed",
          lastError:
            error instanceof MailDeliveryError
              ? error.status
                ? `provider_${error.status}`
                : "delivery_unconfirmed"
              : "configuration_error",
          nextAttemptAt: new Date(Date.now() + Math.min(3600, 60 * 2 ** row.attempts) * 1000)
        })
        .where(eq(electionNotifications.id, row.id));
      failed++;
      continue;
    }
    // Outside the transport catch: a DB failure after acceptance must not schedule a resend.
    await db
      .update(electionNotifications)
      .set({ status: "sent", sentAt: new Date(), providerMessageId: receipt.id, lastError: null })
      .where(eq(electionNotifications.id, row.id));
    sent++;
  }
  await db.execute(sql`UPDATE elections e SET
    notification_sent_count = (SELECT count(*)::int FROM election_notifications n WHERE n.election_id = e.id AND n.status = 'sent'),
    notification_sent_at = CASE WHEN NOT EXISTS (SELECT 1 FROM election_notifications n WHERE n.election_id = e.id AND n.status NOT IN ('sent', 'skipped')) THEN now() ELSE NULL END
    WHERE e.notification_queued_at IS NOT NULL AND e.notification_sent_at IS NULL`);
  const remaining = await db.execute(
    sql`SELECT count(*)::int AS count FROM election_notifications WHERE status NOT IN ('sent','skipped')`
  );
  return { sent, failed, remaining: remaining.rows[0]?.count ?? 0 };
}
