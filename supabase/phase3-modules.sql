-- ============================================================
-- Phase 3 · Migration 1 — video modules + per-student progress
-- Per CONSUMER_TRACK_SPEC.md §2/§3. Adds the video-course backbone:
-- modules (Bunny Stream refs) and module_progress (completion, watch
-- time) keyed to course_enrollments.
--
-- Run once in the Supabase SQL Editor. Additive only — no existing
-- table is modified; the professional track is untouched.
-- ============================================================

-- ————— modules: ordered videos within a video-delivery course —————
create table modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) not null,
  sort_order integer not null,
  title text not null,
  video_provider text check (video_provider in ('vimeo', 'bunny')) default 'bunny',
  video_ref text,                   -- provider's video GUID, NOT a public URL
  duration_sec integer,
  created_at timestamptz default now()
);

create index modules_course_idx on modules (course_id, sort_order);

-- ————— module_progress: one row per enrollment × module —————
create table module_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references course_enrollments(id) not null,
  module_id uuid references modules(id) not null,
  completed_at timestamptz,
  watch_seconds integer default 0,
  unique (enrollment_id, module_id)
);

create index module_progress_enrollment_idx on module_progress (enrollment_id);

-- ————— Row Level Security —————
alter table modules         enable row level security;
alter table module_progress enable row level security;

-- modules: admins full CRUD; students read modules of published courses
-- they hold an ACTIVE enrollment in. video_ref is only the provider's
-- internal GUID (playable URLs are minted by get-playback-token), and it
-- never reaches anon — policies are `to authenticated` only.
create policy "modules_admin_all" on modules
  for all to authenticated
  using (is_admin()) with check (is_admin());

create policy "modules_select_enrolled" on modules
  for select to authenticated
  using (exists (
    select 1
    from course_enrollments ce
    join courses c on c.id = ce.course_id
    where ce.course_id = modules.course_id
      and ce.profile_id = auth.uid()
      and ce.status = 'active'
      and c.is_published = true
  ));

-- module_progress: students read their own rows (via their enrollment);
-- admins read all. No client writes — only the update-progress Edge
-- Function (service role) writes progress.
create policy "module_progress_select_own_or_admin" on module_progress
  for select to authenticated
  using (
    is_admin() or exists (
      select 1 from course_enrollments ce
      where ce.id = module_progress.enrollment_id
        and ce.profile_id = auth.uid()
    )
  );

-- ————— Seed: placeholder consumer course (unpublished) —————
-- Title/slug/pricing are placeholders — rename freely in the dashboard
-- or a later seed; nothing references the slug yet.
insert into courses (slug, title, track, delivery, price_cents, is_published)
values ('sake-fundamentals', 'Sake Fundamentals', 'consumer', 'video', null, false)
on conflict (slug) do nothing;

notify pgrst, 'reload schema';
