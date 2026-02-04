CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE member_status AS ENUM ('pending_verification', 'verified', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE election_status AS ENUM ('draft', 'scheduled', 'open', 'closed', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE verification_method AS ENUM ('email_link', 'admin_import');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name varchar(200) NOT NULL,
  email varchar(320) NOT NULL UNIQUE,
  status member_status NOT NULL DEFAULT 'pending_verification',
  created_at timestamptz NOT NULL DEFAULT now(),
  verified_at timestamptz,
  verification_method verification_method,
  notes text,
  CONSTRAINT members_email_lowercase CHECK (email = lower(email))
);

CREATE TABLE IF NOT EXISTS elections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  description text,
  status election_status NOT NULL DEFAULT 'draft',
  opens_at timestamptz,
  closes_at timestamptz,
  ballot_json jsonb NOT NULL,
  ballot_version varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS election_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  eligible boolean NOT NULL DEFAULT true,
  included_by varchar(320) NOT NULL,
  included_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT election_eligibility_election_member_unique UNIQUE (election_id, member_id)
);

CREATE TABLE IF NOT EXISTS vote_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL,
  ip_hash varchar(64),
  user_agent_hash varchar(64)
);

CREATE INDEX IF NOT EXISTS vote_sessions_election_member_idx ON vote_sessions (election_id, member_id);

CREATE TABLE IF NOT EXISTS votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  ballot_version varchar(50) NOT NULL,
  vote_payload_json jsonb NOT NULL,
  cast_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT votes_election_member_unique UNIQUE (election_id, member_id)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid REFERENCES elections(id) ON DELETE SET NULL,
  actor varchar(320) NOT NULL,
  action varchar(120) NOT NULL,
  details_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  gcs_path text NOT NULL,
  sha256 varchar(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS member_verification_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS member_verification_sessions_member_idx
  ON member_verification_sessions (member_id);
