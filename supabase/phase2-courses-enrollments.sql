-- ============================================================
-- Phase 2 (Consumer Track) · Migration 5 — courses + course enrollments
-- Per CONSUMER_TRACK_SPEC.md §2/§7. This is a SCHEMA migration only:
-- the existing Sake Server Certification flow must behave identically.
--
-- Naming note: the spec calls the course-access table `enrollments`, but
-- that name is already taken by the class-invite table (profile→class).
-- This migration adds the course-access table as `course_enrollments`
-- and leaves the existing `enrollments` table untouched.
--
-- Run once in the Supabase SQL Editor. Safe on the live Phase 1/2 DB:
-- existing exams/attempts/certificates are backfilled in place.
-- ============================================================

-- ————— courses: umbrella object for both tracks —————
create table courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  track text not null check (track in ('professional', 'consumer')),
  delivery text not null check (delivery in ('in_person', 'video')),
  price_cents integer,              -- null for professional (admin-granted access)
  is_published boolean default false,
  created_at timestamptz default now()
);

-- ————— course_enrollments: who has access to what course —————
-- (Spec's `enrollments`; renamed to avoid colliding with the class table.)
create table course_enrollments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) not null,
  course_id uuid references courses(id) not null,
  status text not null check (status in ('active', 'revoked')) default 'active',
  enrolled_at timestamptz default now(),
  unique (profile_id, course_id)
);

create index course_enrollments_profile_idx on course_enrollments (profile_id);
create index course_enrollments_course_idx on course_enrollments (course_id);

-- ————— Link existing objects to a course —————
-- exams and classes gain a course_id so the professional flow is expressed
-- through the new schema. Both stay nullable (future rows may not map 1:1).
alter table exams   add column course_id uuid references courses(id);
alter table classes add column course_id uuid references courses(id);

-- attempts/certificates now reference a course enrollment. Kept NULLABLE so
-- the live flow never breaks between running this SQL and redeploying the
-- Edge Functions; backfilled below, populated going forward by the functions.
alter table attempts     add column enrollment_id uuid references course_enrollments(id);
alter table certificates add column enrollment_id uuid references course_enrollments(id);

-- cert_type distinguishes the two certificate templates (§5). Existing
-- certificates are all professional.
alter table certificates add column cert_type text
  check (cert_type in ('professional', 'completion')) default 'professional';

create index attempts_enrollment_idx     on attempts (enrollment_id);
create index certificates_enrollment_idx on certificates (enrollment_id);

-- ============================================================
-- Backfill — express the existing professional flow in the new schema
-- ============================================================

-- 1. The one professional course that the current exams belong to.
insert into courses (slug, title, track, delivery, price_cents, is_published)
values ('sake-server-certification', 'Sake Server Certification',
        'professional', 'in_person', null, true);

-- 2. Point the existing exams + classes at that course.
update exams   set course_id = (select id from courses where slug = 'sake-server-certification')
  where course_id is null;
update classes set course_id = (select id from courses where slug = 'sake-server-certification')
  where course_id is null;

-- 3. A course enrollment for everyone who already has an attempt or a class
--    enrollment, so their history maps onto a course enrollment.
insert into course_enrollments (profile_id, course_id)
select distinct u.profile_id, c.id
from (
  select user_id as profile_id from attempts
  union
  select user_id as profile_id from enrollments   -- existing class-invite table
) u
cross join (select id from courses where slug = 'sake-server-certification') c
on conflict (profile_id, course_id) do nothing;

-- 4. Backfill attempts.enrollment_id (match user + the exam's course).
update attempts a
set enrollment_id = ce.id
from exams e
join course_enrollments ce on ce.course_id = e.course_id
where a.exam_id = e.id
  and ce.profile_id = a.user_id
  and a.enrollment_id is null;

-- 5. Backfill certificates.enrollment_id from their attempt.
update certificates c
set enrollment_id = a.enrollment_id
from attempts a
where c.attempt_id = a.id
  and c.enrollment_id is null;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table courses            enable row level security;
alter table course_enrollments enable row level security;

-- courses: authenticated read published; admins full CRUD.
create policy "courses_select_published_or_admin" on courses
  for select to authenticated
  using (is_published = true or is_admin());
create policy "courses_admin_insert" on courses
  for insert to authenticated with check (is_admin());
create policy "courses_admin_update" on courses
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "courses_admin_delete" on courses
  for delete to authenticated using (is_admin());

-- course_enrollments: students read their own; admins read/write all.
-- No client insert/update — writes happen via join_class() (SECURITY
-- DEFINER) or the Edge Functions (service role).
create policy "course_enrollments_select_own_or_admin" on course_enrollments
  for select to authenticated
  using (profile_id = auth.uid() or is_admin());
create policy "course_enrollments_admin_write" on course_enrollments
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ============================================================
-- Extend join_class() — joining a class also enrolls the student in the
-- class's course, so a course enrollment exists before their first attempt.
-- (Redefines the function from phase2-classes.sql; class-join behavior is
-- otherwise unchanged.)
-- ============================================================
create or replace function public.join_class(code text)
returns table (class_name text, expires_at timestamptz)
language plpgsql security definer
set search_path = public
as $$
declare
  c classes%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into c from classes
  where upper(invite_code) = upper(trim(code));
  if not found or not c.is_active then
    raise exception 'invalid_code';
  end if;
  if now() > c.expires_at then
    raise exception 'expired';
  end if;
  insert into enrollments (user_id, class_id)
  values (auth.uid(), c.id)
  on conflict (user_id, class_id) do nothing;
  -- New: mirror into course_enrollments for the class's course.
  if c.course_id is not null then
    insert into course_enrollments (profile_id, course_id)
    values (auth.uid(), c.course_id)
    on conflict (profile_id, course_id) do nothing;
  end if;
  return query select c.name, c.expires_at;
end;
$$;

revoke all on function public.join_class(text) from public;
grant execute on function public.join_class(text) to authenticated;

notify pgrst, 'reload schema';
