# Sake Studies Center — Exam Platform Build Spec

Production architecture for a custom quiz/exam platform replacing Thinkific's assessment features. Scale target: 100–500 students/year, both practice quizzes and certification exams, basic exam-integrity safeguards.

**Stack:** React (Vite) frontend · Supabase (Postgres, Auth, Row Level Security, Edge Functions) · Netlify (hosting + deploys)
**Expected running cost:** $0/month on free tiers at this scale; ~$25/month if you later upgrade Supabase Pro for daily backups.

A working UI prototype already exists (`sake-exam-platform.jsx`) demonstrating the student exam flow, practice feedback, timer, results, certificate, and admin views. This spec turns it into a real multi-user application.

---

## 1. Core design decisions

**Server-side grading.** The prototype grades in the browser, which means correct answers ship to the client — trivially cheatable. In production, the client never receives answer keys. Questions are served *without* the `correct_option` field; the student submits their answers to a Supabase Edge Function which grades, records, and returns the result. This single decision provides most of the "basic safeguards" requested.

**Server-side randomization.** The Edge Function that starts an exam selects the random question subset and shuffles option order, storing the exact question set and option ordering with the attempt. This makes every attempt reconstructable for review and prevents students from re-rolling until they get familiar questions.

**Attempt-based time enforcement.** The server records `started_at` when the exam begins. On submission it rejects (or flags) answers arriving after the time limit plus a small grace window (e.g., 20 seconds for network latency). The client timer is UX; the server timer is truth.

**Certificates with public verification.** Each passed certification exam generates a certificate record with a short verification code (e.g., `SSC-2026-8F3K2`). A public page at `/verify/:code` confirms name, exam, score, and date. This makes the credential meaningful to employers — a differentiator no off-the-shelf quiz tool gives you.

**Roles via profile flag.** A `role` column on `profiles` (`student` | `admin`) gates the admin dashboard and write access to questions, enforced by RLS — never by the frontend alone.

---

## 2. Database schema (Postgres / Supabase)

```sql
-- Extends Supabase's built-in auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz default now()
);

create table exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,                          -- "Sake Fundamentals Certification"
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
```

### Row Level Security policies (summary)

| Table | Students | Admins | Public (anon) |
|---|---|---|---|
| profiles | read/update own row | read all | — |
| exams | read published | full CRUD | — |
| questions | **no direct select** (served via Edge Function without answers) | full CRUD | — |
| attempts | read own; insert via function only | read all | — |
| certificates | read own | read all | read via verify_code lookup only |

The `questions` policy is the critical one: students must never be able to `select correct_option`. Serve question content through the Edge Function or a Postgres view that omits the answer column.

---

## 3. Edge Functions (Supabase, Deno)

**`start-attempt`** — Input: `exam_id`. Verifies the user hasn't exceeded `max_attempts`, draws the random question subset, shuffles option order per question, creates the `attempts` row with `question_set`, and returns questions *without* correct answers.

**`submit-attempt`** — Input: `attempt_id`, `answers`. Verifies ownership and that the attempt isn't already submitted; checks elapsed time against `time_limit_seconds` + grace (flag or reject if over); grades against `correct_option`; writes score/passed/`submitted_at`; on pass of a certification exam, creates the `certificates` row with a generated verify code. Returns score, pass/fail, and per-question correctness (practice mode returns explanations too).

**`practice-answer`** *(optional simpler path)* — For practice mode's per-question instant feedback, either grade question-by-question through this function, or accept the minor tradeoff of grading practice quizzes client-side (practice answers being visible is low-stakes; keep server-side grading strictly for certification).

---

## 4. Frontend (React + Vite on Netlify)

Routes:

```
/                    Landing + exam catalog (published exams)
/login               Supabase magic-link email auth (no passwords to support)
/exam/:slug          Setup screen → runner → results (adapts to mode)
/certificate/:id     Printable certificate view (print stylesheet → PDF via browser)
/verify/:code        Public certificate verification (no auth)
/admin               Question bank, exam settings, results table w/ CSV export
```

Carry over the prototype's design system: indigo/rice/hanko-red palette, Shippori Mincho display type, the pass-seal stamp moment, and the existing runner/result/certificate layouts. The prototype file is the visual reference — the rebuild is about wiring, not redesign.

Auth: Supabase magic links keep support burden near zero for a 100–500 person audience (no password resets). Collect `full_name` on first login; it feeds the certificate.

Admin additions beyond the prototype: edit/deactivate questions, CSV question import (columns: prompt, option_a–d, correct, explanation), results export to CSV, and per-exam settings (question count, time limit, pass %, max attempts).

---

## 5. Deployment

1. Supabase: create project → run schema SQL → enable RLS on all tables → add policies → deploy the two Edge Functions (`supabase functions deploy`).
2. Netlify: connect the Git repo → build command `npm run build`, publish `dist` → set env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
3. Custom domain: e.g., `exams.sakestudiescenter.com` (or a path on the main site) via Netlify DNS settings.
4. Supabase Auth settings: add the Netlify URL + custom domain to redirect allowlist for magic links.

---

## 6. Build phases

**Phase 1 — Core (first Claude Code session or two):** schema + RLS, magic-link auth, exam runner wired to `start-attempt`/`submit-attempt`, results recorded. *Milestone: a real student can take a real certification exam end-to-end.*

**Phase 2 — Credential layer:** certificate page with print stylesheet, verify codes + public `/verify` page, admin results table with CSV export.

**Phase 3 — Admin quality of life:** question CRUD UI, CSV import, per-exam settings, multiple exams (e.g., Fundamentals / Advanced levels).

**Phase 4 — Later, as needed:** image-based questions (sake label identification), email delivery of certificates (Resend free tier), payment gating via Stripe Payment Links + a webhook that grants exam access, Thinkific data import (student CSV → invited users).

---

## 7. Open decisions (defaults chosen; change if wrong)

- **Access control:** spec assumes any registered student can take published exams; if exams should be gated to paying students, Phase 4's Stripe webhook (or a manual admin "grant access" toggle, simpler) handles it. Default: manual admin grant toggle — simplest at your volume.
- **Retake policy:** default `max_attempts = 3` per certification exam with no cooldown; adjust per exam in settings.
- **Certificate PDF:** default is a print-optimized page (students print/save as PDF themselves) rather than server-generated PDFs — much less code, looks identical.

---

## 8. Kickoff prompt for Claude Code

> Build the exam platform described in `BUILD_SPEC.md` (this file), Phase 1 only. Stack: Vite + React, Supabase (project URL and anon key in `.env`), deployed to Netlify. Use `sake-exam-platform.jsx` as the visual/UX reference for the runner, results, and certificate screens. Set up the schema and RLS exactly as specified, implement the `start-attempt` and `submit-attempt` Edge Functions with server-side grading and randomization, and wire the frontend with magic-link auth. Stop after Phase 1 and walk me through testing an end-to-end exam attempt.
