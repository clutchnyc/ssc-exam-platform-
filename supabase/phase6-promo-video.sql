-- ============================================================
-- Phase 6 · Migration 2 — course sales video
-- courses.promo_video_ref: Bunny GUID of the public intro/pitch video
-- shown on /enroll/:slug. Signed by get-promo-token (anon-allowed,
-- signs ONLY this designated video) — module playback stays
-- enrollment-gated and untouched.
--
-- Run once in the Supabase SQL Editor. Additive only.
-- ============================================================

alter table courses add column promo_video_ref text;

notify pgrst, 'reload schema';
