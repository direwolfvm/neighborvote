CREATE TABLE email_rate_limits (
  key varchar(64) PRIMARY KEY,
  count integer NOT NULL DEFAULT 1,
  expires_at timestamptz NOT NULL
);
CREATE INDEX email_rate_limits_expiry_idx ON email_rate_limits (expires_at);

ALTER TABLE elections ADD COLUMN notification_queued_at timestamptz;
CREATE TABLE election_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'uncertain', 'skipped')),
  attempts integer NOT NULL DEFAULT 0,
  attempted_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  provider_message_id text,
  last_error varchar(100),
  UNIQUE (election_id, member_id)
);
CREATE INDEX election_notifications_pending_idx ON election_notifications (status, next_attempt_at);
ALTER TABLE manual_vote_counts ADD CONSTRAINT manual_vote_counts_nonnegative CHECK (count >= 0);
