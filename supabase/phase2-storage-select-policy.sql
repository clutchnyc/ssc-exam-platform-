-- ============================================================
-- Phase 2 · Migration 3 — APPLIED 2026-07-17
-- Admins couldn't SELECT storage.objects rows, so client-side
-- list()/remove() on question-images silently no-op'd (uploads and
-- public reads were unaffected).
-- Note: the orphaned rls-test-*.png could NOT be deleted via SQL —
-- Supabase blocks direct deletes on storage tables — it was removed
-- through the Storage API (DELETE /storage/v1/object/...) instead.
-- ============================================================

create policy "question_images_admin_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'question-images' and is_admin());
