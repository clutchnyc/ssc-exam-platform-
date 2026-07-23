// get-promo-token — signs the PUBLIC sales video for a course's enroll page.
//
// Input:  { course_id }
// Output: { embed_url }
//
// Anon-callable by design: the promo video is marketing content shown to
// signed-out visitors. Security boundary: this signs ONLY the video
// designated in courses.promo_video_ref on a PUBLISHED course — it can
// never be pointed at a course module (those go through get-playback-token
// with its enrollment check).
//
// Secrets: BUNNY_LIBRARY_ID, BUNNY_TOKEN_KEY (same as playback)

import { adminClient, corsHeaders, json } from "../_shared/mod.ts";

const TOKEN_TTL_SECONDS = 2 * 60 * 60;

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { course_id } = await req.json().catch(() => ({}));
    if (!course_id) return json({ error: "course_id is required" }, 400);

    const db = adminClient();
    const { data: course } = await db
      .from("courses")
      .select("promo_video_ref, is_published")
      .eq("id", course_id)
      .maybeSingle();
    if (!course?.is_published || !course.promo_video_ref) {
      return json({ error: "No sales video for this course" }, 404);
    }

    const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
    const tokenKey = Deno.env.get("BUNNY_TOKEN_KEY");
    if (!libraryId || !tokenKey) {
      console.error("get-promo-token: BUNNY_LIBRARY_ID / BUNNY_TOKEN_KEY not set");
      return json({ error: "Video service not configured" }, 500);
    }

    const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = await sha256Hex(tokenKey + course.promo_video_ref + expires);
    const embed_url =
      `https://iframe.mediadelivery.net/embed/${libraryId}/${course.promo_video_ref}` +
      `?token=${token}&expires=${expires}&autoplay=false`;

    return json({ embed_url });
  } catch (err) {
    console.error("get-promo-token error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
