CREATE TABLE IF NOT EXISTS admin_login_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  token_hash varchar(64) NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS admin_login_tokens_email_idx ON admin_login_tokens (email);
