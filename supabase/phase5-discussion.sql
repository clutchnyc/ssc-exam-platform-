-- ============================================================
-- Phase 5 · Migration 1 — course discussion board
-- Per CONSUMER_TRACK_SPEC.md §6, plus two additions from Timothy:
--   · module_id — posts can be tagged to a specific video module, so
--     each module links straight into its own thread of questions
--   · author_name — snapshotted at post time by create-post, so
--     students see who's talking without loosening profiles RLS
--
-- Posting goes through the create-post Edge Function only (enrollment
-- check + admin email notification) — no client insert policy.
-- Run once in the Supabase SQL Editor. Additive only.
-- ============================================================

create table discussion_posts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) not null,
  module_id uuid references modules(id),            -- null = general discussion
  profile_id uuid references profiles(id) not null,
  parent_id uuid references discussion_posts(id) on delete cascade,  -- null = top-level
  author_name text not null,
  body text not null,
  created_at timestamptz default now()
);

create index discussion_posts_course_idx on discussion_posts (course_id, created_at desc);
create index discussion_posts_parent_idx on discussion_posts (parent_id);
create index discussion_posts_module_idx on discussion_posts (module_id);

alter table discussion_posts enable row level security;

-- Read: active enrollees of the course, and admins.
create policy "discussion_select_enrolled_or_admin" on discussion_posts
  for select to authenticated
  using (
    is_admin() or exists (
      select 1 from course_enrollments ce
      where ce.course_id = discussion_posts.course_id
        and ce.profile_id = auth.uid()
        and ce.status = 'active'
    )
  );

-- Moderation: admins may delete any post (replies cascade with it).
create policy "discussion_admin_delete" on discussion_posts
  for delete to authenticated
  using (is_admin());

notify pgrst, 'reload schema';
