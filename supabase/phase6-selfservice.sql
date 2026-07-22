-- ============================================================
-- Phase 6 · Migration 1 — admin self-service + schema tightening
--
-- 1. courses.description — editable sales copy for /enroll/:slug
--    (replaces the hardcoded placeholder paragraph).
-- 2. Tightening deferred from Phase 2: every exam belongs to a course,
--    and every attempt/certificate is pinned to an enrollment. All
--    three were backfilled and verified 0-missing on 2026-07-17;
--    start-attempt/submit-attempt stamp them on every new row.
--
-- Run once in the Supabase SQL Editor.
-- ============================================================

alter table courses add column description text;

alter table exams        alter column course_id     set not null;
alter table attempts     alter column enrollment_id set not null;
alter table certificates alter column enrollment_id set not null;

notify pgrst, 'reload schema';
