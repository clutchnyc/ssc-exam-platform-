-- ============================================================
-- Sake Studies Center — Exam Platform · Phase 1 schema
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor)
-- Safe to run on a fresh project only.
-- ============================================================

-- ————— Tables (per BUILD_SPEC.md §2) —————

-- Extends Supabase's built-in auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz default now()
);

create table exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,                          -- "Sake Server Certification"
  slug text unique not null,                    -- "fundamentals"
  mode text not null check (mode in ('practice','certification')),
  question_count int not null default 8,        -- drawn per attempt (cert only)
  time_limit_seconds int,                       -- null for practice
  pass_pct int default 80,
  max_attempts int,                             -- null = unlimited
  is_published boolean default false,
  created_at timestamptz default now()
);

create table questions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references exams(id) on delete cascade,
  prompt text not null,
  options jsonb not null,                       -- ["A","B","C","D"]
  correct_option int not null,
  explanation text,                             -- shown in practice mode
  image_url text,                               -- optional, for label-ID questions
  is_active boolean default true,
  created_at timestamptz default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  exam_id uuid not null references exams(id),
  question_set jsonb not null,                  -- [{question_id, option_order:[2,0,3,1]}]
  answers jsonb,                                -- {question_id: chosen_original_index}
  score_pct int,
  passed boolean,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  flagged_late boolean default false
);

create table certificates (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid unique not null references attempts(id),
  user_id uuid not null references profiles(id),
  verify_code text unique not null,             -- "SSC-2026-8F3K2"
  issued_at timestamptz default now()
);

create index attempts_user_exam_idx on attempts (user_id, exam_id);
create index questions_exam_idx on questions (exam_id);

-- ————— Admin check helper —————
-- SECURITY DEFINER so policies on profiles can call it without
-- recursing into profiles' own RLS policies.
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- ————— Row Level Security —————
alter table profiles     enable row level security;
alter table exams        enable row level security;
alter table questions    enable row level security;
alter table attempts     enable row level security;
alter table certificates enable row level security;

-- profiles: students read/update own row; admins read all
create policy "profiles_select_own_or_admin" on profiles
  for select to authenticated
  using (id = auth.uid() or is_admin());

create policy "profiles_insert_own" on profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Column hardening: clients may only write full_name (+ their own id on
-- insert). `role` stays at its default 'student' — no self-promotion.
revoke insert, update on table profiles from authenticated, anon;
grant insert (id, full_name) on table profiles to authenticated;
grant update (full_name)     on table profiles to authenticated;

-- exams: students read published; admins full CRUD
create policy "exams_select_published_or_admin" on exams
  for select to authenticated
  using (is_published = true or is_admin());

create policy "exams_admin_insert" on exams
  for insert to authenticated with check (is_admin());
create policy "exams_admin_update" on exams
  for update to authenticated using (is_admin()) with check (is_admin());
create policy "exams_admin_delete" on exams
  for delete to authenticated using (is_admin());

-- questions: NO student select — answer keys never reach the client.
-- Question content is served by Edge Functions (service role bypasses RLS).
create policy "questions_admin_all" on questions
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- attempts: students read their own; admins read all.
-- No insert/update policies: attempts are created and graded exclusively
-- by the Edge Functions (service role).
create policy "attempts_select_own_or_admin" on attempts
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- certificates: students read their own; admins read all.
-- (Public verify-by-code lookup lands in Phase 2 as a dedicated RPC.)
create policy "certificates_select_own_or_admin" on certificates
  for select to authenticated
  using (user_id = auth.uid() or is_admin());

-- ============================================================
-- Seed data — two published exams + the 12 prototype questions
-- ============================================================

insert into exams (title, slug, mode, question_count, time_limit_seconds, pass_pct, max_attempts, is_published) values
  ('Sake Server Practice Quiz',   'practice',    'practice',      12, null, 80, null, true),
  ('Sake Server Certification',   'sake-server', 'certification',  8, 480,  80, 3,    true);

with q(prompt, options, correct_option, explanation) as (
  values
    ('What is the primary ingredient used to make sake?',
     '["Barley","Rice","Wheat","Sorghum"]'::jsonb, 1,
     'Sake is brewed from polished rice, along with water, koji, and yeast.'),
    ('What does ''seimaibuai'' (精米歩合) refer to?',
     '["Fermentation temperature","The rice polishing ratio","Alcohol by volume","Aging duration"]'::jsonb, 1,
     'Seimaibuai is the percentage of the rice grain remaining after polishing — 60% means 40% has been milled away.'),
    ('Junmai Daiginjo requires rice polished to at most what percentage remaining?',
     '["70%","60%","50%","40%"]'::jsonb, 2,
     'Daiginjo classifications require a seimaibuai of 50% or less.'),
    ('What is the role of koji (麹) in sake brewing?',
     '["Adds carbonation","Converts rice starch into fermentable sugar","Filters the moromi","Raises acidity for preservation"]'::jsonb, 1,
     'Koji mold (Aspergillus oryzae) produces enzymes that break rice starch into sugars the yeast can ferment.'),
    ('Which term describes sake that has NOT been pasteurized?',
     '["Genshu","Nigori","Namazake","Koshu"]'::jsonb, 2,
     'Namazake (生酒) is unpasteurized sake, prized for fresh, lively character — and it requires refrigeration.'),
    ('''Genshu'' (原酒) indicates a sake that is…',
     '["Undiluted with water","Cloudy and unfiltered","Aged over three years","Brewed with wild yeast"]'::jsonb, 0,
     'Genshu skips the customary dilution step, typically landing at 18–20% ABV.'),
    ('The Nada brewing district, famous for its ''miyamizu'' water, is located near which city?',
     '["Niigata","Kyoto","Kobe","Hiroshima"]'::jsonb, 2,
     'Nada, in Hyogo Prefecture near Kobe, is Japan''s largest sake-producing region, known for hard miyamizu water.'),
    ('Which rice variety is often called the ''king of sake rice''?',
     '["Koshihikari","Yamada Nishiki","Gohyakumangoku","Omachi"]'::jsonb, 1,
     'Yamada Nishiki, first grown in Hyogo, is the most celebrated shuzo-kotekimai (sake-specific rice).'),
    ('A ''nihonshu-do'' (SMV) of +10 generally indicates a sake that is…',
     '["Very sweet","Very dry","Highly acidic","Low in alcohol"]'::jsonb, 1,
     'Sake Meter Value measures density; higher positive numbers indicate a drier sake.'),
    ('What is ''moromi'' (醪)?',
     '["The main fermentation mash","Pressed sake lees","A wooden brewing vat","The rice-washing stage"]'::jsonb, 0,
     'Moromi is the main mash where rice, koji, water, and yeast ferment together over several weeks.'),
    ('Which serving vessel is the small ceramic flask traditionally used to serve warmed sake?',
     '["Ochoko","Masu","Tokkuri","Guinomi"]'::jsonb, 2,
     'The tokkuri is the flask; ochoko and guinomi are cups; a masu is the square cedar box.'),
    ('Futsushu (普通酒) refers to…',
     '["Premium designation sake","Ordinary table sake without a special designation","Sparkling sake","Sake brewed only in winter"]'::jsonb, 1,
     'Futsushu is non-premium ''ordinary'' sake, making up the majority of sake produced in Japan.')
)
insert into questions (exam_id, prompt, options, correct_option, explanation)
select e.id, q.prompt, q.options, q.correct_option, q.explanation
from q cross join exams e;

-- ============================================================
-- After your first login, promote yourself to admin by running:
--   update profiles set role = 'admin'
--   where id = (select id from auth.users where email = 'tim@urbansake.com');
-- ============================================================
