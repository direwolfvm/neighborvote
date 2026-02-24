DO $$ BEGIN
  CREATE TYPE staff_role AS ENUM ('admin', 'election_manager');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS staff_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  role staff_role NOT NULL,
  added_by varchar(320) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_roles_email_unique UNIQUE (email),
  CONSTRAINT staff_roles_email_lowercase CHECK (email = lower(email))
);
