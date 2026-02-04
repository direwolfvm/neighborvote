import {
  boolean,
  check,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  varchar
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const memberStatusEnum = pgEnum("member_status", [
  "pending_verification",
  "verified",
  "inactive"
]);

export const electionStatusEnum = pgEnum("election_status", [
  "draft",
  "scheduled",
  "open",
  "closed",
  "archived"
]);

export const verificationMethodEnum = pgEnum("verification_method", [
  "email_link",
  "admin_import"
]);

export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: varchar("full_name", { length: 200 }).notNull(),
    email: varchar("email", { length: 320 }).notNull(),
    status: memberStatusEnum("status").notNull().default("pending_verification"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    verificationMethod: verificationMethodEnum("verification_method"),
    notes: text("notes")
  },
  (table) => [
    unique("members_email_unique").on(table.email),
    check("members_email_lowercase", sql`${table.email} = lower(${table.email})`)
  ]
);

export const elections = pgTable("elections", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description"),
  status: electionStatusEnum("status").notNull().default("draft"),
  opensAt: timestamp("opens_at", { withTimezone: true }),
  closesAt: timestamp("closes_at", { withTimezone: true }),
  ballotJson: jsonb("ballot_json").notNull(),
  ballotVersion: varchar("ballot_version", { length: 50 }).notNull(),
  notificationSentAt: timestamp("notification_sent_at", { withTimezone: true }),
  notificationSentCount: integer("notification_sent_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const electionEligibility = pgTable(
  "election_eligibility",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    eligible: boolean("eligible").notNull().default(true),
    includedBy: varchar("included_by", { length: 320 }).notNull(),
    includedAt: timestamp("included_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [
    unique("election_eligibility_election_member_unique").on(
      table.electionId,
      table.memberId
    )
  ]
);

export const voteSessions = pgTable(
  "vote_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgentHash: varchar("user_agent_hash", { length: 64 })
  },
  (table) => [
    unique("vote_sessions_token_hash_unique").on(table.tokenHash),
    index("vote_sessions_election_member_idx").on(table.electionId, table.memberId)
  ]
);

export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    ballotVersion: varchar("ballot_version", { length: 50 }).notNull(),
    votePayloadJson: jsonb("vote_payload_json").notNull(),
    castAt: timestamp("cast_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("votes_election_member_unique").on(table.electionId, table.memberId)]
);

export const manualVoteCounts = pgTable(
  "manual_vote_counts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    electionId: uuid("election_id")
      .notNull()
      .references(() => elections.id, { onDelete: "cascade" }),
    choiceId: varchar("choice_id", { length: 100 }).notNull(),
    count: integer("count").notNull().default(0),
    updatedBy: varchar("updated_by", { length: 320 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [unique("manual_vote_counts_election_choice_unique").on(table.electionId, table.choiceId)]
);

export const auditEvents = pgTable("audit_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  electionId: uuid("election_id").references(() => elections.id, {
    onDelete: "set null"
  }),
  actor: varchar("actor", { length: 320 }).notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  detailsJson: jsonb("details_json").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const exportsTable = pgTable("exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  electionId: uuid("election_id")
    .notNull()
    .references(() => elections.id, { onDelete: "cascade" }),
  gcsPath: text("gcs_path").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const memberVerificationSessions = pgTable(
  "member_verification_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("member_verification_sessions_token_hash_unique").on(table.tokenHash),
    index("member_verification_sessions_member_idx").on(table.memberId)
  ]
);

export const adminLoginTokens = pgTable(
  "admin_login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("admin_login_tokens_token_hash_unique").on(table.tokenHash),
    index("admin_login_tokens_email_idx").on(table.email)
  ]
);

export const memberLoginTokens = pgTable(
  "member_login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("member_login_tokens_token_hash_unique").on(table.tokenHash),
    index("member_login_tokens_member_idx").on(table.memberId)
  ]
);

export const memberLoginTokens = pgTable(
  "member_login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("member_login_tokens_token_hash_unique").on(table.tokenHash),
    index("member_login_tokens_member_idx").on(table.memberId)
  ]
);

export const memberLoginTokens = pgTable(
  "member_login_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull()
  },
  (table) => [
    unique("member_login_tokens_token_hash_unique").on(table.tokenHash),
    index("member_login_tokens_member_idx").on(table.memberId)
  ]
);

export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
