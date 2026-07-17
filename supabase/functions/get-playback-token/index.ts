// get-playback-token — mints a short-lived signed Bunny Stream embed URL.
//
// Input:  { module_id }
// Output: { embed_url, expires }
//
// The client never sees a permanent playback link: access is re-checked
// here on every request (active course_enrollment on the module's
// published course; admins bypass for previewing), then the embed URL is
// signed per Bunny's token authentication:
//   token = SHA256_HEX(BUNNY_TOKEN_KEY + video_ref + expires)
//   https://iframe.mediadelivery.net/embed/{lib}/{ref}?token=…&expires=…
//
// Secrets (supabase secrets set): BUNNY_LIBRARY_ID, BUNNY_TOKEN_KEY
// (the library's Token Authentication key — enable token auth on the
// library in the Bunny dashboard or every signed URL will be ignored).

import { adminClient, corsHeaders, getUser, json } from "../_shared/mod.ts";

const TOKEN_TTL_SECONDS = 6 * 60 * 60; // 6h: survives a long viewing session

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
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const { module_id } = await req.json().catch(() => ({}));
    if (!module_id) return json({ error: "module_id is required" }, 400);

    const db = adminClient();

    const { data: module } = await db
      .from("modules")
      .select("id, video_ref, video_provider, courses:course_id(id, is_published)")
      .eq("id", module_id)
      .maybeSingle();
    if (!module || !module.video_ref) {
      return json({ error: "Module not found" }, 404);
    }
    if (module.video_provider !== "bunny") {
      return json({ error: "Unsupported video provider" }, 400);
    }
    const course = module.courses as unknown as { id: string; is_published: boolean };

    // ——— Access: active enrollment on a published course (admins bypass) ———
    const { data: profileRow } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRow?.role !== "admin") {
      if (!course.is_published) return json({ error: "Module not found" }, 404);
      const { data: enrollment } = await db
        .from("course_enrollments")
        .select("id")
        .eq("profile_id", user.id)
        .eq("course_id", course.id)
        .eq("status", "active")
        .maybeSingle();
      if (!enrollment) {
        return json({ error: "Not enrolled in this course.", code: "not_enrolled" }, 403);
      }
    }

    const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
    const tokenKey = Deno.env.get("BUNNY_TOKEN_KEY");
    if (!libraryId || !tokenKey) {
      console.error("get-playback-token: BUNNY_LIBRARY_ID / BUNNY_TOKEN_KEY not set");
      return json({ error: "Video service not configured" }, 500);
    }

    const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const token = await sha256Hex(tokenKey + module.video_ref + expires);
    const embed_url =
      `https://iframe.mediadelivery.net/embed/${libraryId}/${module.video_ref}` +
      `?token=${token}&expires=${expires}&autoplay=false`;

    return json({ embed_url, expires });
  } catch (err) {
    console.error("get-playback-token error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
