// submit-attempt — grades an attempt server-side and records the result.
//
// Input:  { attempt_id, answers }   answers = { [question_id]: displayed_index }
// Output: { score_pct, correct_count, total, passed, flagged_late, mode,
//           results: [{ question_id, correct, correct_index?, explanation? }],
//           certificate: { id, verify_code } | null }
//
// Displayed indices are mapped back to original option indices via the
// option_order stored with the attempt, then graded against correct_option.
// The server clock is truth: submissions beyond time limit + grace are
// flagged and (for certification) cannot pass.
// correct_index/explanation are only revealed for PRACTICE exams —
// certification results show right/wrong per question, not the answers.

import {
  adminClient,
  corsHeaders,
  getUser,
  GRACE_SECONDS,
  json,
} from "../_shared/mod.ts";

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1

function makeVerifyCode(): string {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return `SSC-${new Date().getFullYear()}-${code}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { attempt_id, answers } = await req.json().catch(() => ({}));
    if (!attempt_id) return json({ error: "attempt_id is required" }, 400);

    const db = adminClient();

    const { data: attempt } = await db
      .from("attempts")
      .select("*")
      .eq("id", attempt_id)
      .maybeSingle();
    if (!attempt || attempt.user_id !== user.id) {
      return json({ error: "Attempt not found" }, 404);
    }
    if (attempt.submitted_at) {
      return json({ error: "Attempt already submitted" }, 409);
    }

    const { data: exam } = await db
      .from("exams")
      .select("*")
      .eq("id", attempt.exam_id)
      .single();

    // ——— Server-side time enforcement ———
    const elapsed = (Date.now() - new Date(attempt.started_at).getTime()) / 1000;
    const flaggedLate = exam.time_limit_seconds != null &&
      elapsed > exam.time_limit_seconds + GRACE_SECONDS;

    // ——— Grade against correct_option ———
    const questionSet: { question_id: string; option_order: number[] }[] =
      attempt.question_set;
    const ids = questionSet.map((e) => e.question_id);
    const { data: qRows } = await db
      .from("questions")
      .select("id, correct_option, explanation")
      .in("id", ids);
    const byId = new Map((qRows ?? []).map((q) => [q.id, q]));

    const isCert = exam.mode === "certification";
    const storedAnswers: Record<string, number | null> = {};
    const results: Record<string, unknown>[] = [];
    let correctCount = 0;

    for (const entry of questionSet) {
      const q = byId.get(entry.question_id);
      if (!q) continue;
      const displayed = answers?.[entry.question_id];
      const original =
        typeof displayed === "number" && Number.isInteger(displayed) &&
          displayed >= 0 && displayed < entry.option_order.length
          ? entry.option_order[displayed]
          : null;
      storedAnswers[entry.question_id] = original;

      const correct = original !== null && original === q.correct_option;
      if (correct) correctCount++;

      const row: Record<string, unknown> = {
        question_id: entry.question_id,
        correct,
      };
      if (!isCert) {
        // Practice mode: reveal the right answer (as a display index) + why.
        row.correct_index = entry.option_order.indexOf(q.correct_option);
        row.explanation = q.explanation;
      }
      results.push(row);
    }

    const total = questionSet.length;
    const scorePct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const passed = isCert
      ? scorePct >= (exam.pass_pct ?? 80) && !flaggedLate
      : null;

    const { error: updateErr } = await db
      .from("attempts")
      .update({
        answers: storedAnswers,
        score_pct: scorePct,
        passed,
        submitted_at: new Date().toISOString(),
        flagged_late: flaggedLate,
      })
      .eq("id", attempt_id);
    if (updateErr) throw updateErr;

    // ——— Certificate on passing a certification exam ———
    let certificate: { id: string; verify_code: string } | null = null;
    if (isCert && passed) {
      for (let i = 0; i < 5 && !certificate; i++) {
        const { data: cert, error: certErr } = await db
          .from("certificates")
          .insert({
            attempt_id,
            user_id: user.id,
            verify_code: makeVerifyCode(),
          })
          .select("id, verify_code")
          .single();
        if (!certErr) certificate = cert;
        else if (certErr.code !== "23505") throw certErr; // retry only on code collision
      }
    }

    return json({
      score_pct: scorePct,
      correct_count: correctCount,
      total,
      passed,
      flagged_late: flaggedLate,
      mode: exam.mode,
      results,
      certificate,
    });
  } catch (err) {
    console.error("submit-attempt error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
