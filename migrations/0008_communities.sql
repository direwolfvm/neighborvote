CREATE TABLE communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(80) NOT NULL UNIQUE,
  name varchar(200) NOT NULL,
  description text,
  contact_email varchar(320),
  rules_json jsonb NOT NULL DEFAULT '{"registrationOpen":true,"allowedPostalCodes":[],"blockedEmails":[],"blockedEmailDomains":[],"requiredAttestations":[]}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- Preserve the prototype's roster, elections and staff in one initial community.
INSERT INTO communities (slug, name, description) VALUES ('neighborvote', 'NeighborVote Community', 'Our neighborhood, our shared decisions.');
ALTER TABLE elections ADD COLUMN community_id uuid REFERENCES communities(id);
UPDATE elections SET community_id = (SELECT id FROM communities WHERE slug = 'neighborvote');
ALTER TABLE elections ALTER COLUMN community_id SET NOT NULL;
CREATE INDEX elections_community_idx ON elections(community_id);

CREATE TABLE community_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status varchar(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','excluded')),
  answers_json jsonb NOT NULL DEFAULT '{"postalCode":"","attestations":[]}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, member_id)
);
INSERT INTO community_memberships (community_id, member_id)
SELECT c.id, m.id FROM communities c CROSS JOIN members m WHERE c.slug = 'neighborvote';

ALTER TABLE staff_roles ADD COLUMN community_id uuid REFERENCES communities(id) ON DELETE CASCADE;
UPDATE staff_roles SET community_id = (SELECT id FROM communities WHERE slug = 'neighborvote');
ALTER TABLE staff_roles ALTER COLUMN community_id SET NOT NULL;
ALTER TABLE staff_roles DROP CONSTRAINT staff_roles_email_unique;
ALTER TABLE staff_roles ADD CONSTRAINT staff_roles_community_email_unique UNIQUE (community_id, email);
CREATE INDEX staff_roles_email_idx ON staff_roles(email);

ALTER TABLE member_verification_sessions ADD COLUMN community_id uuid REFERENCES communities(id) ON DELETE CASCADE;
UPDATE member_verification_sessions SET community_id = (SELECT id FROM communities WHERE slug = 'neighborvote');
ALTER TABLE member_verification_sessions ALTER COLUMN community_id SET NOT NULL;
ALTER TABLE member_verification_sessions ADD COLUMN answers_json jsonb NOT NULL DEFAULT '{"postalCode":"","attestations":[]}'::jsonb;
