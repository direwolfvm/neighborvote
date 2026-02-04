CREATE TABLE IF NOT EXISTS member_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS member_login_tokens_member_idx ON member_login_tokens (member_id);
