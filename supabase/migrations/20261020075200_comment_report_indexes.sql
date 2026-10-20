create index if not exists comment_reports_story_created_idx
  on public.comment_reports (story_id, created_at desc);

create index if not exists comment_reports_reporter_created_idx
  on public.comment_reports (reporter_user_id, created_at desc);
