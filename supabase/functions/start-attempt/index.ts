// start-attempt — begins (or resumes) an exam attempt.
//
// Input:  { exam_id }
// Output: { attempt_id, mode, time_limit_seconds, remaining_seconds,
//           started_at, resumed,
//           questions: [{ id, prompt, image_url, question_type, options }] }
//
// Server-side randomization: the random question subset and per-question
// option order are chosen HERE and stored on the attempt. Questions are
// returned WITHOUT correct_option/accepted_answers — answer keys never
// reach the client. Short-answer questions have options: null and an
// empty option_order.

import {
  adminClient,
  corsHeaders,
  getUser,
  GRACE_SECONDS,
  json,
  shuffle,
} from "../_shared/mod.ts";

type SetEntry = { question_id: string; option_order: number[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { exam_id } = await req.json().catch(() => ({}));
    if (!exam_id) return json({ error: "exam_id is required" }, 400);

    const db = adminClient();

    // ——— Class-enrollment gate (admins bypass) ———
    // Access requires enrollment in an active class whose window is open.
    const { data: profileRow } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRow?.role !== "admin") {
      const { data: enrollments } = await db
        .from("enrollments")
        .select("classes!inner(is_active, expires_at)")
        .eq("user_id", user.id);
      const hasAccess = (enrollments ?? []).some((e) => {
        const c = e.classes as unknown as { is_active: boolean; expires_at: string };
        return c.is_active && new Date(c.expires_at).getTime() >= Date.now();
      });
      if (!hasAccess) {
        return json(
          { error: "Exam access requires a class invite link.", code: "not_enrolled" },
          403,
        );
      }
    }

    const { data: exam } = await db
      .from("exams")
      .select("*")
      .eq("id", exam_id)
      .eq("is_published", true)
      .maybeSingle();
    if (!exam) return json({ error: "Exam not found" }, 404);

    // ——— Resume an open attempt if one exists and time remains ———
    const { data: open } = await db
      .from("attempts")
      .select("*")
      .eq("user_id", user.id)
      .eq("exam_id", exam_id)
      .is("submitted_at", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (open) {
      const elapsed = (Date.now() - new Date(open.started_at).getTime()) / 1000;
      const expired = exam.time_limit_seconds != null &&
        elapsed > exam.time_limit_seconds + GRACE_SECONDS;

      if (!expired) {
        const questions = await buildQuestions(db, open.question_set);
        return json({
          attempt_id: open.id,
          mode: exam.mode,
          time_limit_seconds: exam.time_limit_seconds,
          remaining_seconds: exam.time_limit_seconds == null
            ? null
            : Math.max(0, Math.round(exam.time_limit_seconds - elapsed)),
          started_at: open.started_at,
          resumed: true,
          questions,
        });
      }

      // Abandoned past the limit: close it as an unscored, late attempt
      // so it can't be resumed, and so it counts toward max_attempts.
      await db
        .from("attempts")
        .update({
          submitted_at: new Date().toISOString(),
          score_pct: 0,
          passed: exam.mode === "certification" ? false : null,
          flagged_late: true,
        })
        .eq("id", open.id);
    }

    // ——— Enforce max_attempts ———
    if (exam.max_attempts != null) {
      const { count } = await db
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("exam_id", exam_id);
      if ((count ?? 0) >= exam.max_attempts) {
        return json(
          { error: `Attempt limit reached (${exam.max_attempts}).`, code: "attempt_limit" },
          403,
        );
      }
    }

    // ——— Draw the randomized question set ———
    const { data: pool } = await db
      .from("questions")
      .select("id, prompt, options, image_url, question_type")
      .eq("exam_id", exam_id)
      .eq("is_active", true);
    if (!pool || pool.length === 0) {
      return json({ error: "This exam has no questions yet." }, 400);
    }

    const n = exam.mode === "certification"
      ? Math.min(exam.question_count, pool.length)
      : pool.length;
    const drawn = shuffle(pool).slice(0, n);

    const question_set: SetEntry[] = drawn.map((q) => ({
      question_id: q.id,
      option_order: q.question_type === "short_answer"
        ? []
        : shuffle((q.options as string[]).map((_, i) => i)),
    }));

    const { data: attempt, error: insertErr } = await db
      .from("attempts")
      .insert({ user_id: user.id, exam_id, question_set })
      .select("id, started_at")
      .single();
    if (insertErr) throw insertErr;

    const byId = new Map(drawn.map((q) => [q.id, q]));
    const questions = question_set.map((entry) => {
      const q = byId.get(entry.question_id)!;
      return {
        id: q.id,
        prompt: q.prompt,
        image_url: q.image_url,
        question_type: q.question_type,
        options: q.question_type === "short_answer"
          ? null
          : entry.option_order.map((i) => (q.options as string[])[i]),
      };
    });

    return json({
      attempt_id: attempt.id,
      mode: exam.mode,
      time_limit_seconds: exam.time_limit_seconds,
      remaining_seconds: exam.time_limit_seconds,
      started_at: attempt.started_at,
      resumed: false,
      questions,
    });
  } catch (err) {
    console.error("start-attempt error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

/** Rebuild the display-ordered question list for a resumed attempt. */
async function buildQuestions(
  db: ReturnType<typeof adminClient>,
  questionSet: SetEntry[],
) {
  const ids = questionSet.map((e) => e.question_id);
  const { data: rows } = await db
    .from("questions")
    .select("id, prompt, options, image_url, question_type")
    .in("id", ids);
  const byId = new Map((rows ?? []).map((q) => [q.id, q]));
  return questionSet.map((entry) => {
    const q = byId.get(entry.question_id)!;
    return {
      id: q.id,
      prompt: q.prompt,
      image_url: q.image_url,
      question_type: q.question_type,
      options: q.question_type === "short_answer"
        ? null
        : entry.option_order.map((i) => (q.options as string[])[i]),
    };
  });
}
