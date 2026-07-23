-- ============================================================
-- Phase 7 · Migration 1 — legacy-import prep
-- 1. source tag on attempts/certificates: 'app' (native) vs
--    'thinkific' (imported from the old platform's score listing).
-- 2. Pass mark corrected to 75 — the historical standard; 80 was a
--    placeholder. (Practice quiz's informational pass_pct too.)
--
-- Run once in the Supabase SQL Editor.
-- ============================================================

alter table attempts     add column source text not null default 'app';
alter table certificates add column source text not null default 'app';

update exams set pass_pct = 75;

notify pgrst, 'reload schema';
