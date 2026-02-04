import { and, eq, isNull, lte, notExists, or } from "drizzle-orm";
import { db } from "@/db/client";
import { auditEvents, electionEligibility, elections, members } from "@/db/schema";
import { sendEmail } from "@/lib/mailer";
import { appBaseUrl } from "@/lib/urls";

function electionUrl(electionId: string): string {
  return new URL(`/elections/${electionId}`, appBaseUrl()).toString();
}

async function sendElectionOpeningNotice(params: {
  electionId: string;
  electionName: string;
  recipients: Array<{ id: string; email: string }>;
}): Promise<void> {
  const url = electionUrl(params.electionId);

  for (const recipient of params.recipients) {
    await sendEmail({
      to: recipient.email,
      subject: `Election is open: ${params.electionName}`,
      text: `The election "${params.electionName}" is now open. Open ballot: ${url}`
    });
  }
}

export async function dispatchOpenElectionNotifications(options?: { electionId?: string; actor?: string }) {
  const now = new Date();
  const dueElectionWhere = options?.electionId
    ? and(
        eq(elections.status, "open"),
        isNull(elections.notificationSentAt),
        or(isNull(elections.opensAt), lte(elections.opensAt, now)),
        eq(elections.id, options.electionId)
      )
    : and(
        eq(elections.status, "open"),
        isNull(elections.notificationSentAt),
        or(isNull(elections.opensAt), lte(elections.opensAt, now))
      );

  const dueElections = await db
    .select({
      id: elections.id,
      name: elections.name,
      opensAt: elections.opensAt
    })
    .from(elections)
    .where(dueElectionWhere);

  for (const election of dueElections) {
    const recipients = await db
      .select({
        id: members.id,
        email: members.email
      })
      .from(members)
      .where(
        and(
          eq(members.status, "verified"),
          notExists(
            db
              .select({ id: electionEligibility.id })
              .from(electionEligibility)
              .where(
                and(
                  eq(electionEligibility.electionId, election.id),
                  eq(electionEligibility.memberId, members.id),
                  eq(electionEligibility.eligible, false)
                )
              )
          )
        )
      );

    await sendElectionOpeningNotice({
      electionId: election.id,
      electionName: election.name,
      recipients
    });

    await db
      .update(elections)
      .set({
        notificationSentAt: now,
        notificationSentCount: recipients.length
      })
      .where(eq(elections.id, election.id));

    await db.insert(auditEvents).values({
      electionId: election.id,
      actor: options?.actor ?? "system",
      action: "election.opening_notifications_sent",
      detailsJson: {
        recipientCount: recipients.length,
        opensAt: election.opensAt?.toISOString() ?? null
      }
    });
  }

  return { processed: dueElections.length };
}
