// create-post — the only write path for discussion posts.
//
// Input:  { course_id, body, module_id?, parent_id? }
// Output: { post } (the inserted row)
//
// Checks an ACTIVE course enrollment (admins bypass), enforces one-level
// threading (a reply's parent must be a top-level post in the same
// course), snapshots the author's display name onto the row, then sends
// a best-effort notification email to the admin via Resend — a failed
// email never fails the post.
//
// Secrets: RESEND_API_KEY (email skipped if unset)
// Optional: ADMIN_NOTIFY_EMAIL (default tim@urbansake.com),
//           RESEND_FROM (default onboarding@resend.dev — switch to the
//           sakestudiescenter.com sender once the domain is verified)

import { adminClient, corsHeaders, getUser, json } from "../_shared/mod.ts";

const MAX_BODY = 5000;
const APP_URL = "https://ssc-exams.netlify.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { course_id, module_id, parent_id, body } = await req.json().catch(() => ({}));
    if (!course_id) return json({ error: "course_id is required" }, 400);
    const text = typeof body === "string" ? body.trim() : "";
    if (!text) return json({ error: "Write something first." }, 400);
    if (text.length > MAX_BODY) return json({ error: `Posts are capped at ${MAX_BODY} characters.` }, 400);

    const db = adminClient();

    const { data: profileRow } = await db
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .maybeSingle();
    if (!profileRow) return json({ error: "Complete your profile first." }, 400);
    const isAdmin = profileRow.role === "admin";

    const { data: course } = await db
      .from("courses")
      .select("id, slug, title")
      .eq("id", course_id)
      .maybeSingle();
    if (!course) return json({ error: "Course not found" }, 404);

    if (!isAdmin) {
      const { data: enrollment } = await db
        .from("course_enrollments")
        .select("id")
        .eq("profile_id", user.id)
        .eq("course_id", course_id)
        .eq("status", "active")
        .maybeSingle();
      if (!enrollment) {
        return json({ error: "The discussion board is for enrolled students.", code: "not_enrolled" }, 403);
      }
    }

    // Module tag must belong to this course.
    let moduleTitle: string | null = null;
    if (module_id) {
      const { data: mod } = await db
        .from("modules")
        .select("id, title, course_id")
        .eq("id", module_id)
        .maybeSingle();
      if (!mod || mod.course_id !== course_id) {
        return json({ error: "Module not found in this course" }, 400);
      }
      moduleTitle = mod.title;
    }

    // One-level threading: replies attach only to top-level posts here.
    if (parent_id) {
      const { data: parent } = await db
        .from("discussion_posts")
        .select("id, course_id, parent_id")
        .eq("id", parent_id)
        .maybeSingle();
      if (!parent || parent.course_id !== course_id) {
        return json({ error: "Post you're replying to wasn't found" }, 404);
      }
      if (parent.parent_id) {
        return json({ error: "Replies can't be nested further — reply to the original post." }, 400);
      }
    }

    const { data: post, error: insertErr } = await db
      .from("discussion_posts")
      .insert({
        course_id,
        module_id: module_id ?? null,
        parent_id: parent_id ?? null,
        profile_id: user.id,
        author_name: profileRow.full_name,
        body: text,
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    // ——— Admin notification (best-effort; own posts don't notify) ———
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (resendKey && !isAdmin) {
      const to = Deno.env.get("ADMIN_NOTIFY_EMAIL") ?? "tim@urbansake.com";
      const from = Deno.env.get("RESEND_FROM") ?? "SSC Discussions <onboarding@resend.dev>";
      const where = moduleTitle ? `${course.title} · ${moduleTitle}` : course.title;
      const kind = parent_id ? "reply" : "post";
      const boardUrl = `${APP_URL}/course/${course.slug}/discussion${module_id ? `?module=${module_id}` : ""}`;
      try {
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [to],
            subject: `New ${kind} in ${where} — ${profileRow.full_name}`,
            html: `<p><strong>${escapeHtml(profileRow.full_name)}</strong> wrote a new ${kind} in <strong>${escapeHtml(where)}</strong>:</p>` +
              `<blockquote style="border-left:3px solid #41b56f;margin:12px 0;padding:6px 14px;color:#303030;white-space:pre-wrap;">${escapeHtml(text)}</blockquote>` +
              `<p><a href="${boardUrl}">Open the discussion board</a></p>`,
          }),
        });
        if (!emailRes.ok) {
          console.error("create-post: Resend returned", emailRes.status, await emailRes.text());
        }
      } catch (emailErr) {
        console.error("create-post: notification email failed:", emailErr);
      }
    }

    return json({ post });
  } catch (err) {
    console.error("create-post error:", err);
    return json({ error: "Internal error" }, 500);
  }
});

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}
