// bunny-video-info — admin-only lookup of a Bunny Stream video's metadata.
//
// Input:  { video_ref }
// Output: { title, duration_sec, status, ready }
//
// Used by the admin Courses tab to validate a pasted video GUID and
// auto-fill duration — no manual second-counting, no typo'd GUIDs.
// Requires the BUNNY_API_KEY secret (the video library's API key, distinct
// from BUNNY_TOKEN_KEY used for embed signing).
//
// Bunny status codes: 0 created · 1 uploaded · 2 processing · 3 transcoding
// · 4 finished · 5 error · 6 upload failed. ready = finished.

import { adminClient, corsHeaders, getUser, json } from "../_shared/mod.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const user = await getUser(req);
    if (!user) return json({ error: "Not authenticated" }, 401);

    const db = adminClient();
    const { data: profileRow } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profileRow?.role !== "admin") {
      return json({ error: "Admins only" }, 403);
    }

    const { video_ref } = await req.json().catch(() => ({}));
    if (!video_ref || typeof video_ref !== "string") {
      return json({ error: "video_ref is required" }, 400);
    }

    const libraryId = Deno.env.get("BUNNY_LIBRARY_ID");
    const apiKey = Deno.env.get("BUNNY_API_KEY");
    if (!libraryId || !apiKey) {
      console.error("bunny-video-info: BUNNY_LIBRARY_ID / BUNNY_API_KEY not set");
      return json({ error: "Video service not configured" }, 500);
    }

    const res = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${encodeURIComponent(video_ref.trim())}`,
      { headers: { AccessKey: apiKey, Accept: "application/json" } },
    );
    if (res.status === 404) {
      return json({ error: "No video with that ID exists in the library." }, 404);
    }
    if (!res.ok) {
      console.error("bunny-video-info: Bunny API returned", res.status);
      return json({ error: "Could not reach the video library." }, 502);
    }

    const video = await res.json();
    return json({
      title: video.title ?? null,
      duration_sec: Number.isFinite(video.length) ? video.length : null,
      status: video.status,
      ready: video.status === 4,
    });
  } catch (err) {
    console.error("bunny-video-info error:", err);
    return json({ error: "Internal error" }, 500);
  }
});
