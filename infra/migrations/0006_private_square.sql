-- Guest H5 stories stay private. Public publishing requires a separate moderation release.
BEGIN;

CREATE TABLE private_stories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES app_users(id),
  title varchar(60) NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 60),
  body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 3000),
  visibility varchar(16) NOT NULL DEFAULT 'private' CHECK (visibility = 'private'),
  moderation varchar(16) NOT NULL DEFAULT 'private' CHECK (moderation = 'private'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX private_stories_owner_recent ON private_stories(owner_user_id, created_at DESC)
  WHERE deleted_at IS NULL;
ALTER TABLE private_stories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private_stories FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON private_stories TO service_role;

COMMIT;
