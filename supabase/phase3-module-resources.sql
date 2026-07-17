-- ============================================================
-- Phase 3 · Migration 2 — module descriptions + downloadable resources
-- Adds a description and an optional attached file (PDF handout) per
-- module. Files live in a PRIVATE bucket; students receive short-lived
-- signed URLs from get-playback-token (enrollment re-checked per
-- request), mirroring the video trust model. Admin-only writes.
--
-- Run once in the Supabase SQL Editor. Additive only.
-- ============================================================

alter table modules
  add column description text,
  add column resource_path text,   -- storage object path in course-materials
  add column resource_name text;   -- original filename, shown as the download label

-- Private bucket: no public read, no student-facing policies at all.
-- Signed URLs are minted by the service role (bypasses RLS); only admins
-- may write objects.
insert into storage.buckets (id, name, public)
values ('course-materials', 'course-materials', false)
on conflict (id) do nothing;

create policy "course_materials_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'course-materials' and is_admin());

create policy "course_materials_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'course-materials' and is_admin())
  with check (bucket_id = 'course-materials' and is_admin());

create policy "course_materials_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'course-materials' and is_admin());

notify pgrst, 'reload schema';
