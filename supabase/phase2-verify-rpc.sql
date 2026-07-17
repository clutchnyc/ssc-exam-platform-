-- ============================================================
-- Phase 2 · Migration 2 — public certificate verification RPC
-- Anon-callable, SECURITY DEFINER: exposes exactly the fields a
-- verifier needs for a matching code, and nothing else.
-- ============================================================

create or replace function public.verify_certificate(code text)
returns table (full_name text, exam_title text, issued_at timestamptz, verify_code text)
language sql stable security definer
set search_path = public
as $$
  select p.full_name, e.title, c.issued_at, c.verify_code
  from certificates c
  join profiles p on p.id = c.user_id
  join attempts a on a.id = c.attempt_id
  join exams e on e.id = a.exam_id
  where upper(c.verify_code) = upper(trim(code));
$$;

revoke all on function public.verify_certificate(text) from public;
grant execute on function public.verify_certificate(text) to anon, authenticated;
