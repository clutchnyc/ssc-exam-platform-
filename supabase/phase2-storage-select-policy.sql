-- ============================================================
-- Phase 2 · Migration 3 — PENDING, run at next token session
-- Admins couldn't SELECT storage.objects rows, so client-side
-- list()/remove() on question-images silently no-op (uploads and
-- public reads were unaffected). Also cleans an orphaned RLS-test
-- object left by the 2026-07-16 editor verification.
-- ============================================================

create policy "question_images_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'question-images' and is_admin());

delete from storage.objects
where bucket_id = 'question-images' and name like 'rls-test-%';
