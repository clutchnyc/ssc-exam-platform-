// practice-answer — per-question instant feedback for PRACTICE exams only.
//
// Input:  { attempt_id, question_id, answer }
//         answer = displayed index (mc) | free-text string (short_answer)
// Output: { correct, correct_index?, correct_answer?, explanation }
//
// Lets practice mode show "correct / not quite + explanation" after each
// question (matching the prototype UX) while still keeping answer keys
// server-side. Refuses to run for certification attempts.

import {
  adminClient,
  corsHeaders,
  getUser,
  json,
  shortAnswerCorrect,
} from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { attempt_id, question_id, answer } = await req.json().catch(() => ({}));
    if (
      !attempt_id || !question_id ||
      (typeof answer !== "number" && typeof answer !== "string")
    ) {
      return json({ error: "attempt_id, question_id, answer are required" }, 400);
    }

    const db = adminClient();

    const { data: attempt } = await db
      .from("attempts")
      .select("id, user_id, exam_id, question_set, submitted_at")
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
      .select("mode")
      .eq("id", attempt.exam_id)
      .single();
    if (exam.mode !== "practice") {
      return json({ error: "Instant feedback is practice-only" }, 403);
    }

    const entry = (attempt.question_set as {
      question_id: string;
      option_order: number[];
    }[]).find((e) => e.question_id === question_id);
    if (!entry) return json({ error: "Question not in this attempt" }, 400);

    const { data: q } = await db
      .from("questions")
      .select("question_type, correct_option, accepted_answers, explanation")
      .eq("id", question_id)
      .single();

    if (q.question_type === "short_answer") {
      if (typeof answer !== "string" || !answer.trim()) {
        return json({ error: "A text answer is required" }, 400);
      }
      return json({
        correct: shortAnswerCorrect(answer, q.accepted_answers),
        correct_answer: (q.accepted_answers as string[])[0],
        explanation: q.explanation,
      });
    }

    if (
      typeof answer !== "number" || !Number.isInteger(answer) || answer < 0 ||
      answer >= entry.option_order.length
    ) {
      return json({ error: "Invalid answer index" }, 400);
    }

    const original = entry.option_order[answer];
    return json({
      correct: original === q.correct_option,
      correct_index: entry.option_order.indexOf(q.correct_option),
      explanation: q.explanation,
    });
  } catch (err) {
    console.error("practice-answer error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
