alter table public.private_stories
  drop constraint if exists private_stories_body_check;

alter table public.private_stories
  add constraint private_stories_content_shape
  check (
    length(btrim(body)) <= 3000
    and (
      length(btrim(body)) >= 1
      or jsonb_array_length(media) >= 1
    )
  );

notify pgrst, 'reload schema';
