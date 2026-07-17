-- ============================================================
-- Phase 4 · Migration 1 — Stripe payments + public course visibility
-- Per CONSUMER_TRACK_SPEC.md §2/§4. payments is NEVER written from the
-- client: create-checkout-session (service role) inserts the pending
-- row; stripe-webhook (service role, signature-verified) marks it paid
-- and activates the enrollment.
--
-- Run once in the Supabase SQL Editor. Additive only.
-- ============================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) not null,
  course_id uuid references courses(id) not null,
  stripe_session_id text unique not null,
  amount_cents integer not null,
  status text not null check (status in ('pending', 'paid', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz default now()
);

create index payments_profile_idx on payments (profile_id);
create index payments_course_idx on payments (course_id);

alter table payments enable row level security;

-- Students see their own payment history; admins see all.
-- No insert/update/delete policies — client writes are impossible.
create policy "payments_select_own_or_admin" on payments
  for select to authenticated
  using (profile_id = auth.uid() or is_admin());

-- Public sales page: signed-out visitors may see published courses
-- (title, price — nothing sensitive lives on this table).
create policy "courses_select_published_anon" on courses
  for select to anon
  using (is_published = true);

notify pgrst, 'reload schema';
