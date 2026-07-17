import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { invokeFn, supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

// Consumer video course: module list → Bunny player (signed embed URL from
// get-playback-token) → completion quiz, unlocked once every module is
// complete. Watch progress rides the Player.js postMessage protocol the
// Bunny iframe speaks; the server (update-progress) owns completion truth
// (90% watched auto-completes; "Mark complete" is the fallback).

const PROGRESS_INTERVAL_MS = 15000;

export default function CoursePage() {
  const { slug } = useParams();
  const { session, user, profile, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState(undefined); // undefined = loading, null = not found
  const [modules, setModules] = useState(null);
  const [progress, setProgress] = useState({}); // module_id -> {completed, watch_seconds}
  const [quiz, setQuiz] = useState(null); // published exam attached to this course
  const [active, setActive] = useState(null); // module being played
  const [embedUrl, setEmbedUrl] = useState(null);
  const [resource, setResource] = useState(null); // {url, name} signed download
  const [playerError, setPlayerError] = useState("");
  const [marking, setMarking] = useState(false);

  const iframeRef = useRef(null);
  const maxSecondsRef = useRef(0); // furthest position in the active module
  const activeRef = useRef(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("courses")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => setCourse(data ?? null));
  }, [slug, user]);

  useEffect(() => {
    if (!course) return;
    supabase
      .from("modules")
      .select("id, title, description, sort_order, duration_sec")
      .eq("course_id", course.id)
      .order("sort_order")
      .then(({ data }) => setModules(data ?? []));
    supabase
      .from("exams")
      .select("id, slug, title, pass_pct, question_count")
      .eq("course_id", course.id)
      .eq("is_published", true)
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setQuiz(data ?? null));
    // Own progress: RLS scopes module_progress to this student's enrollments.
    supabase
      .from("module_progress")
      .select("module_id, completed_at, watch_seconds, modules!inner(course_id)")
      .eq("modules.course_id", course.id)
      .then(({ data }) => {
        const map = {};
        for (const r of data ?? []) {
          map[r.module_id] = { completed: !!r.completed_at, watch_seconds: r.watch_seconds };
        }
        setProgress(map);
      });
  }, [course]);

  // ——— Flush watch progress to the server ———
  const flush = useCallback(async (moduleId, { markComplete = false } = {}) => {
    if (!moduleId) return;
    try {
      const res = await invokeFn("update-progress", {
        module_id: moduleId,
        watch_seconds: Math.floor(maxSecondsRef.current),
        ...(markComplete ? { mark_complete: true } : {}),
      });
      setProgress((p) => ({
        ...p,
        [moduleId]: { completed: res.completed, watch_seconds: res.watch_seconds },
      }));
    } catch {
      /* progress reporting is best-effort; next tick retries */
    }
  }, []);

  // Periodic flush while a module plays; final flush on switch/unmount.
  useEffect(() => {
    activeRef.current = active?.id ?? null;
    if (!active) return;
    const timer = setInterval(() => flush(active.id), PROGRESS_INTERVAL_MS);
    return () => {
      clearInterval(timer);
      flush(active.id);
    };
  }, [active, flush]);

  // ——— Player.js listener: the Bunny iframe posts timeupdate events ———
  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== "https://iframe.mediadelivery.net") return;
      let msg;
      try {
        msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      if (msg?.context !== "player.js") return;
      if (msg.event === "ready") {
        // Subscribe to timeupdate on handshake.
        iframeRef.current?.contentWindow?.postMessage(
          JSON.stringify({ context: "player.js", version: "0.0.11", method: "addEventListener", value: "timeupdate" }),
          "https://iframe.mediadelivery.net",
        );
      } else if (msg.event === "timeupdate" && msg.value?.seconds != null) {
        if (msg.value.seconds > maxSecondsRef.current) {
          maxSecondsRef.current = msg.value.seconds;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  async function openModule(mod) {
    setPlayerError("");
    setEmbedUrl(null);
    setResource(null);
    setActive(mod);
    maxSecondsRef.current = progress[mod.id]?.watch_seconds ?? 0;
    try {
      const res = await invokeFn("get-playback-token", { module_id: mod.id });
      setEmbedUrl(res.embed_url);
      if (res.resource_url) setResource({ url: res.resource_url, name: res.resource_name });
    } catch (err) {
      setPlayerError(err.message || "Could not load the video.");
    }
  }

  async function markComplete() {
    if (!active) return;
    setMarking(true);
    await flush(active.id, { markComplete: true });
    setMarking(false);
  }

  if (session === undefined || profileLoading) return <Loading />;
  if (!session) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        <Link to="/login" style={{ color: C.green }}>Sign in</Link> to view your course.
      </p>
    );
  }
  if (course === undefined || modules === null) return <Loading />;
  if (course === null) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        No course here. <Link to="/" style={{ color: C.green }}>Back to portal</Link>
      </p>
    );
  }
  if (modules.length === 0) {
    // RLS returns nothing without an active enrollment (or before content exists).
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        This course isn't available on your account.{" "}
        <Link to="/" style={{ color: C.green }}>Back to portal</Link>
      </p>
    );
  }

  const doneCount = modules.filter((m) => progress[m.id]?.completed).length;
  const allDone = doneCount === modules.length;
  const isAdmin = profile?.role === "admin";

  return (
    <div>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brandGreen, fontWeight: 600, marginBottom: 8 }}>Video course</p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 30, fontWeight: 700, margin: "0 0 6px" }}>{course.title}</h1>
      <p style={{ fontFamily: fontMono, fontSize: 12, color: C.mist, margin: "0 0 24px" }}>
        {doneCount} of {modules.length} modules complete
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(240px, 1fr)", gap: 20, alignItems: "start" }}>
        {/* ——— Player ——— */}
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, overflow: "hidden" }}>
          {active ? (
            <>
              <div style={{ aspectRatio: "16 / 9", background: "#000" }}>
                {embedUrl ? (
                  <iframe
                    ref={iframeRef}
                    src={embedUrl}
                    title={active.title}
                    style={{ width: "100%", height: "100%", border: 0, display: "block" }}
                    allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <p style={{ color: "#fff", fontFamily: fontMono, fontSize: 13, textAlign: "center", paddingTop: "22%" }}>
                    {playerError || "Loading video…"}
                  </p>
                )}
              </div>
              <div style={{ padding: "14px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <h2 style={{ fontFamily: fontDisplay, fontSize: 17, fontWeight: 700, margin: 0 }}>{active.title}</h2>
                  {progress[active.id]?.completed ? (
                    <span style={{ fontFamily: fontMono, fontSize: 12, color: C.green, whiteSpace: "nowrap" }}>✓ Complete</span>
                  ) : (
                    <button
                      onClick={markComplete}
                      disabled={marking}
                      style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 0, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: fontBody, color: C.ink, whiteSpace: "nowrap", opacity: marking ? 0.5 : 1 }}
                    >
                      {marking ? "Saving…" : "Mark complete"}
                    </button>
                  )}
                </div>
                {active.description && (
                  <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, margin: "10px 0 0", whiteSpace: "pre-wrap" }}>
                    {active.description}
                  </p>
                )}
                {resource && (
                  <a
                    href={resource.url}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, padding: "9px 14px", fontSize: 13.5, fontWeight: 600, textDecoration: "none", color: C.ink, fontFamily: fontBody }}
                  >
                    📄 Download: {resource.name ?? "course material"}
                  </a>
                )}
              </div>
            </>
          ) : (
            <p style={{ color: C.mist, fontSize: 14, textAlign: "center", padding: "80px 20px" }}>
              Pick a module to start watching.
            </p>
          )}
        </div>

        {/* ——— Module list + quiz ——— */}
        <div style={{ display: "grid", gap: 8 }}>
          {modules.map((mod, i) => {
            const done = progress[mod.id]?.completed;
            const isActive = active?.id === mod.id;
            return (
              <button
                key={mod.id}
                onClick={() => openModule(mod)}
                style={{ display: "flex", alignItems: "center", gap: 12, textAlign: "left", background: C.paper, border: `1px solid ${isActive ? C.brandGreen : C.line}`, borderLeft: `3px solid ${done ? C.brandGreen : C.line}`, borderRadius: 0, padding: "13px 14px", cursor: "pointer", fontFamily: fontBody }}
              >
                <span style={{ fontFamily: fontMono, fontSize: 12, color: done ? C.green : C.mist, minWidth: 18 }}>
                  {done ? "✓" : i + 1}
                </span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: isActive ? 700 : 500, color: C.ink }}>{mod.title}</span>
                {mod.duration_sec != null && (
                  <span style={{ fontFamily: fontMono, fontSize: 11.5, color: C.mist }}>
                    {Math.floor(mod.duration_sec / 60)}:{String(mod.duration_sec % 60).padStart(2, "0")}
                  </span>
                )}
              </button>
            );
          })}

          {quiz && (
            <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${allDone ? C.brandGreen : C.line}`, borderRadius: 4, padding: 18, marginTop: 8 }}>
              <h2 style={{ fontFamily: fontDisplay, fontSize: 17, fontWeight: 700, margin: "0 0 6px" }}>{quiz.title}</h2>
              <p style={{ fontSize: 13, color: C.body, lineHeight: 1.5, margin: "0 0 12px" }}>
                {allDone
                  ? `You've watched everything — take the quiz to earn your completion certificate. ${quiz.pass_pct}% to pass, untimed.`
                  : `Complete all ${modules.length} modules to unlock the quiz.`}
              </p>
              <button
                onClick={() => navigate(`/exam/${quiz.slug}`)}
                disabled={!allDone && !isAdmin}
                style={{ width: "100%", background: allDone || isAdmin ? C.brandGreen : C.line, color: allDone || isAdmin ? "#fff" : C.mist, border: "none", borderRadius: 0, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: allDone || isAdmin ? "pointer" : "default", fontFamily: fontBody }}
              >
                {allDone || isAdmin ? "Start the quiz" : "Locked"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Loading() {
  return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Loading…</p>;
}
