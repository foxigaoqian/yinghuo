BEGIN;

ALTER TABLE public.private_stories
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS media jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.private_stories
  DROP CONSTRAINT IF EXISTS private_stories_media_shape;
ALTER TABLE public.private_stories
  ADD CONSTRAINT private_stories_media_shape
  CHECK (jsonb_typeof(media) = 'array' AND jsonb_array_length(media) <= 9);

CREATE INDEX IF NOT EXISTS private_stories_profile_recent
  ON public.private_stories(profile_id, created_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.story_comments
  ADD COLUMN IF NOT EXISTS parent_comment_id uuid
  REFERENCES public.story_comments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS story_comments_parent_created_idx
  ON public.story_comments(parent_comment_id, created_at)
  WHERE deleted_at IS NULL AND moderation = 'published';

-- Existing tables are reached only by the server-side Edge gateway.
REVOKE ALL ON public.private_stories, public.story_comments FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_stories, public.story_comments TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
