// update-progress — records watch time / completion for a video module.
//
// Input:  { module_id, watch_seconds?, mark_complete? }
// Output: { completed, watch_seconds, course_complete }
//
// Completion policy (Timothy's decision, 2026-07-17): a module completes
// automatically once watch time reaches 90% of its duration, OR when the
// student explicitly marks it complete (fallback for skimmers/playback
// trouble). Completion never un-sets. watch_seconds is monotonic — the
// server keeps the max ever reported, so seeking backwards can't shrink
// progress. All writes happen here (service role); clients have no write
// policy on module_progress.
//
// course_complete reports whether every module in the course is now
// complete for this enrollment — the client uses it to unlock the quiz.

import { adminClient, corsHeaders, getUser, json } from "../_shared/mod.ts";

const COMPLETE_AT_PCT = 0.9;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { module_id, watch_seconds, mark_complete } = await req.json().catch(() => ({}));
    if (!module_id) return json({ error: "module_id is required" }, 400);

    const db = adminClient();

    const { data: module } = await db
      .from("modules")
      .select("id, course_id, duration_sec")
      .eq("id", module_id)
      .maybeSingle();
    if (!module) return json({ error: "Module not found" }, 404);

    const { data: enrollment } = await db
      .from("course_enrollments")
      .select("id")
      .eq("profile_id", user.id)
      .eq("course_id", module.course_id)
      .eq("status", "active")
      .maybeSingle();
    if (!enrollment) {
      return json({ error: "Not enrolled in this course.", code: "not_enrolled" }, 403);
    }

    const { data: existing } = await db
      .from("module_progress")
      .select("id, watch_seconds, completed_at")
      .eq("enrollment_id", enrollment.id)
      .eq("module_id", module_id)
      .maybeSingle();

    // Monotonic watch time; sanitize the client's number.
    const reported = typeof watch_seconds === "number" && Number.isFinite(watch_seconds)
      ? Math.max(0, Math.floor(watch_seconds))
      : 0;
    const newWatch = Math.max(existing?.watch_seconds ?? 0, reported);

    const autoComplete = module.duration_sec != null && module.duration_sec > 0 &&
      newWatch >= module.duration_sec * COMPLETE_AT_PCT;
    const completedAt = existing?.completed_at ??
      ((mark_complete === true || autoComplete) ? new Date().toISOString() : null);

    const { error: upsertErr } = await db
      .from("module_progress")
      .upsert(
        {
          enrollment_id: enrollment.id,
          module_id,
          watch_seconds: newWatch,
          completed_at: completedAt,
        },
        { onConflict: "enrollment_id,module_id" },
      );
    if (upsertErr) throw upsertErr;

    // ——— Course completion: every module complete for this enrollment? ———
    const { data: courseModules } = await db
      .from("modules")
      .select("id")
      .eq("course_id", module.course_id);
    const { data: done } = await db
      .from("module_progress")
      .select("module_id")
      .eq("enrollment_id", enrollment.id)
      .not("completed_at", "is", null);
    const doneIds = new Set((done ?? []).map((r) => r.module_id));
    const course_complete = (courseModules ?? []).length > 0 &&
      (courseModules ?? []).every((m) => doneIds.has(m.id));

    return json({
      completed: completedAt != null,
      watch_seconds: newWatch,
      course_complete,
    });
  } catch (err) {
    console.error("update-progress error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
