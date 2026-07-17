# Sake Studies Center — Consumer Video Track Extension Spec

**Extends:** `BUILD_SPEC.md` (Phase 1 exam platform — Sake Server Certification)
**Adds:** video course delivery, consumer completion track, Stripe payments, discussion board
**Stack (unchanged):** React (Vite) · Supabase (Postgres, Auth, RLS, Edge Functions) · Netlify
**New external services:** Stripe (payments), Vimeo or Bunny Stream (video hosting — decision pending)

---

## 1. What this spec adds

The Phase 1 platform was built for one track: **Sake Server Certification** — in-person classes, professional students, timed/randomized/server-graded exams, verified certificates.

This spec generalizes that into a two-track system:

| | Sake Server Certification | Consumer Video Course |
|---|---|---|
| Audience | Trade professionals | Consumers, nationwide |
| Delivery | In-person class | Pre-recorded video modules |
| Access | Exam link sent by admin | Stripe purchase → instant access |
| Quiz | Timed, randomized, strict | Untimed, forgiving, simple |
| Certificate | Verified credential (`/verify/:code`) | Fun completion certificate, same brand, distinct look |
| Community | None | Discussion board, enrolled students only |

One Supabase project, one `profiles` table, one login for both tracks.

---

## 2. Schema additions

```sql
-- Courses: the umbrella object for both tracks
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

-- Enrollment: who has access to what
create table enrollments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) not null,
  course_id uuid references courses(id) not null,
  status text not null check (status in ('active', 'revoked')) default 'active',
  enrolled_at timestamptz default now(),
  unique (profile_id, course_id)
);

-- Video modules (consumer/video track only)
create table modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) not null,
  sort_order integer not null,
  title text not null,
  video_provider text check (video_provider in ('vimeo', 'bunny')),
  video_ref text,                   -- provider's video ID, NOT a public URL
  duration_sec integer,
  created_at timestamptz default now()
);

-- Per-student module completion
create table module_progress (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid references enrollments(id) not null,
  module_id uuid references modules(id) not null,
  completed_at timestamptz,
  watch_seconds integer default 0,
  unique (enrollment_id, module_id)
);

-- Quizzes now generalized (extends Phase 1 exam concept)
create table quizzes (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) not null,
  quiz_type text not null check (quiz_type in ('certification', 'completion')),
  pass_threshold_pct integer not null default 70,
  time_limit_sec integer,           -- null = untimed (consumer track)
  question_count integer not null,
  created_at timestamptz default now()
);

-- quiz_attempts, certificates: same shape as Phase 1, now referencing
-- enrollment_id instead of a bare profile/exam pair. cert_type added.
alter table certificates add column cert_type text
  check (cert_type in ('professional', 'completion')) default 'professional';

-- Payments (Stripe — consumer track only)
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

-- Discussion board (consumer track only, gated to enrolled students)
create table discussion_posts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid references courses(id) not null,
  profile_id uuid references profiles(id) not null,
  parent_id uuid references discussion_posts(id),  -- null = top-level post
  body text not null,
  created_at timestamptz default now()
);
```

**RLS notes:**
- `enrollments`: student can read their own row; admin can read/write all.
- `module_progress`, `discussion_posts`: gated to rows where `enrollment.status = 'active'` for that student and course.
- `payments`: never writable from the client — only the Stripe webhook Edge Function (service role) writes to this table.
- `modules.video_ref`: never exposed to unauthenticated requests; only returned to a client with an active enrollment, and even then it's the provider's internal ID, not a playable URL.

---

## 3. Video playback flow

1. Student navigates to a module in an enrolled course.
2. Frontend calls Edge Function `get-playback-token`.
3. Edge Function checks `enrollments.status = 'active'` for that student + course (service role, bypasses RLS trust issues on the client).
4. If valid, Edge Function calls the video provider's API (Vimeo or Bunny) to mint a short-lived signed playback URL/token.
5. Frontend receives the signed URL and plays it — never a permanent public link.
6. On playback milestones (e.g. 90% watched) or explicit "mark complete," frontend calls `update-progress`, which writes `module_progress.completed_at`.
7. Quiz unlock check: all `modules` for the course must have a matching `module_progress.completed_at` before `quizzes` (for that course) becomes accessible.

*Provider choice (Vimeo vs. Bunny Stream) is still open — this flow works identically with either; only the API call inside `get-playback-token` changes.*

---

## 4. Payment flow (Stripe)

1. Student clicks "Enroll" on a consumer course → frontend calls Edge Function `create-checkout-session`, passing `course_id`.
2. Edge Function creates a Stripe Checkout Session (price pulled server-side from `courses.price_cents` — never trust a client-supplied price) and returns the Checkout URL.
3. Student completes payment on Stripe's hosted page.
4. Stripe sends a `checkout.session.completed` webhook to Edge Function `stripe-webhook`.
5. Webhook verifies the Stripe signature, then:
   - Inserts/updates the `payments` row (`status = 'paid'`).
   - Inserts an `enrollments` row (`status = 'active'`).
6. Student is redirected back to the app, now enrolled — no manual step, no admin involvement, mirrors the "server does the trustworthy thing" pattern already used for grading.

---

## 5. Certificates

Both cert types share one `certificates` table and one underlying data shape (name, course, date, score), rendered through two templates gated by `cert_type`:

- **`professional`** — existing Phase 1 design: verification code, `/verify/:code` public lookup page, formal layout, hanko-style seal.
- **`completion`** — same brand system (logo, palette) but warmer tone, no verification code (no credential-integrity stakes), lighter/illustrated treatment. Visually related to, but not confusable with, the professional certificate.

---

## 6. Discussion board

Simple threaded model, scoped per course, gated to active enrollments:

- Top-level posts and one level of replies (`parent_id`).
- No moderation tooling in Phase 1 beyond admin delete (reuse the `role = 'admin'` check already in place).
- Deliberately not a full community platform (no notifications, DMs, profiles) — start minimal, revisit if usage justifies a dedicated platform (Circle, Mighty Networks) later.

---

## 7. Phasing recommendation

Building on top of the already-in-progress Phase 1:

- **Phase 2** — `courses`, `enrollments`, generalize `quizzes`/`quiz_attempts`/`certificates` to reference enrollments; add `cert_type`. Get the *existing* Sake Server Certification flow running through the new schema (no behavior change for professional students, just a schema migration).
- **Phase 3** — `modules`, `module_progress`, video provider integration (`get-playback-token`, `update-progress`), quiz-unlock logic.
- **Phase 4** — `payments`, Stripe Checkout + webhook, enrollment-on-payment.
- **Phase 5** — `discussion_posts`, basic threaded UI.

Each phase is independently shippable and testable — Phase 2 alone is a safe migration of what already works.

---

## 8. Open decisions before build

- [ ] Vimeo vs. Bunny Stream for video hosting
- [ ] Consumer course pricing (per course, set in `courses.price_cents`)
- [ ] Pass threshold for completion quiz (spec defaults to 70%, easy to change per quiz)
- [ ] Whether "mark complete" on a video module is self-reported or tied to a watch-percentage threshold
