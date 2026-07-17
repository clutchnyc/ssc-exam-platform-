-- ============================================================
-- Phase 2 · Migration 1 — short-answer questions + image bucket
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor).
-- Safe on the live Phase 1 database; existing rows become 'mc'.
-- ============================================================

-- ————— questions: type + accepted answers —————
alter table questions
  add column question_type text not null default 'mc'
    check (question_type in ('mc','short_answer')),
  add column accepted_answers jsonb;   -- ["seimaibuai","精米歩合"] (short_answer only)

-- options/correct_option are MC-only now; shape is enforced per type below.
alter table questions alter column options drop not null;
alter table questions alter column correct_option drop not null;

alter table questions add constraint questions_type_shape check (
  (
    question_type = 'mc'
    and options is not null
    and correct_option is not null
  ) or (
    question_type = 'short_answer'
    and accepted_answers is not null
    and jsonb_typeof(accepted_answers) = 'array'
    and jsonb_array_length(accepted_answers) > 0
  )
);

-- ————— Storage bucket for question images —————
-- Public read (image URLs render in the exam runner); admin-only writes.
insert into storage.buckets (id, name, public)
values ('question-images', 'question-images', true)
on conflict (id) do nothing;

create policy "question_images_admin_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'question-images' and is_admin());

create policy "question_images_admin_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'question-images' and is_admin())
  with check (bucket_id = 'question-images' and is_admin());

create policy "question_images_admin_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'question-images' and is_admin());

-- ————— Seed: two short-answer questions on the practice quiz —————
-- (Test material only — certification pool is untouched; add real
-- short-answer questions to the cert exam when ready.)
insert into questions (exam_id, prompt, question_type, accepted_answers, explanation)
select e.id, q.prompt, 'short_answer', q.accepted_answers, q.explanation
from (values
  ('What is the Japanese term for the rice-polishing ratio?',
   '["seimaibuai","精米歩合","seimai buai"]'::jsonb,
   'Seimaibuai (精米歩合) is the percentage of the rice grain remaining after polishing.'),
  ('Name the mold used in sake brewing to convert rice starch into fermentable sugar.',
   '["koji","kōji","koji-kin","koji kin","麹","aspergillus oryzae"]'::jsonb,
   'Koji (Aspergillus oryzae) produces the enzymes that saccharify rice starch — answers like "kōji" or "koji-kin" also count.')
) as q(prompt, accepted_answers, explanation)
join exams e on e.slug = 'practice';
