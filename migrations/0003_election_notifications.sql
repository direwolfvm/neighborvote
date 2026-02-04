ALTER TABLE elections
  ADD COLUMN IF NOT EXISTS notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS notification_sent_count integer NOT NULL DEFAULT 0;
