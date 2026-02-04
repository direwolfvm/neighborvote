CREATE TABLE IF NOT EXISTS manual_vote_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  election_id uuid NOT NULL REFERENCES elections(id) ON DELETE CASCADE,
  choice_id varchar(100) NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_by varchar(320) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_vote_counts_election_choice_unique UNIQUE (election_id, choice_id)
);
