import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";
import { PENDING_JOIN_KEY } from "./JoinPage";

export default function Landing() {
  const { session, profile, profileLoading } = useAuth();

  if (session === undefined) return <Loading />;
  if (!session) return <Hero />;
  if (profileLoading) return <Loading />;
  if (!profile) return <CompleteProfile />;
  return <Catalog />;
}

function Loading() {
  return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Loading…</p>;
}

function Hero() {
  return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brandGreen, fontWeight: 600, marginBottom: 8 }}>Assessment</p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 10px" }}>Test your sake knowledge.</h1>
      <p style={{ color: C.body, maxWidth: 460, lineHeight: 1.6, margin: "0 auto 32px" }}>
        Practice freely with instant feedback, or sit the timed certification
        exam. Sign in with your email to begin — results are recorded and a
        certificate is issued on passing.
      </p>
      <Link
        to="/login"
        style={{ display: "inline-block", background: C.brandGreen, color: "#fff", borderRadius: 0, padding: "13px 34px", fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: fontBody }}
      >
        Sign in to begin
      </Link>
    </div>
  );
}

function CompleteProfile() {
  const { createProfile } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await createProfile(name.trim());
    } catch (err) {
      setError(err.message || "Could not save your name — try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: 32, maxWidth: 460, margin: "40px auto" }}>
      <h2 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, marginTop: 0 }}>Welcome — one last thing</h2>
      <p style={{ fontSize: 14, color: C.body, lineHeight: 1.55 }}>
        Tell us your full name. It appears on your certificate when you pass a
        certification exam, so make it the one you want printed.
      </p>
      <form onSubmit={save}>
        <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.mist, margin: "18px 0 6px" }}>
          Your full name
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Jordan Tanaka"
          style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: `1px solid ${C.line}`, borderRadius: 3, fontFamily: fontBody, background: C.rice }}
        />
        {error && <p style={{ fontSize: 13, color: C.hanko, marginTop: 10 }}>{error}</p>}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          style={{ width: "100%", marginTop: 22, background: C.brandGreen, opacity: saving || !name.trim() ? 0.45 : 1, color: "#fff", border: "none", borderRadius: 0, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function Catalog() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";
  const [exams, setExams] = useState(null);
  const [certs, setCerts] = useState([]);
  const [courses, setCourses] = useState(null); // enrolled video courses (consumer track)
  // undefined = checking, null = no valid class window, {name, expires_at} = open
  const [access, setAccess] = useState(isAdmin ? { admin: true } : undefined);

  useEffect(() => {
    // A join link captured before sign-in/profile completes finishes here
    const pending = localStorage.getItem(PENDING_JOIN_KEY);
    if (pending) {
      navigate(`/join/${encodeURIComponent(pending)}`, { replace: true });
      return;
    }
    // Professional-track exams only — video-course quizzes live on their
    // course page, not the landing grid.
    supabase
      .from("exams")
      .select("*, courses:course_id(delivery)")
      .eq("is_published", true)
      .order("mode", { ascending: false }) // practice first
      .then(({ data }) => setExams((data ?? []).filter((e) => e.courses?.delivery !== "video")));
    supabase
      .from("certificates")
      .select("verify_code, issued_at, attempts:attempt_id(exams:exam_id(title))")
      .order("issued_at", { ascending: false })
      .then(({ data }) => setCerts(data ?? []));
    // Consumer track: published video courses this student is enrolled in.
    supabase
      .from("course_enrollments")
      .select("status, courses:course_id(slug, title, delivery, is_published)")
      .eq("status", "active")
      .then(({ data }) => {
        setCourses(
          (data ?? [])
            .map((e) => e.courses)
            .filter((c) => c && c.delivery === "video" && c.is_published),
        );
      });
    if (!isAdmin) {
      supabase
        .from("enrollments")
        .select("classes(name, expires_at, is_active)")
        .then(({ data }) => {
          const open = (data ?? [])
            .map((e) => e.classes)
            .filter((c) => c && c.is_active && new Date(c.expires_at).getTime() >= Date.now())
            .sort((a, b) => new Date(b.expires_at) - new Date(a.expires_at));
          setAccess(open[0] ?? null);
        });
    }
  }, [isAdmin, navigate]);

  if (!exams || access === undefined || courses === null) return <Loading />;

  if (access === null && courses.length === 0) {
    // Signed in, but no open class window — the portal is students-only.
    return (
      <div>
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${C.brandGreen}`, padding: 32, maxWidth: 520, margin: "20px auto 0", textAlign: "center" }}>
          <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brandGreen, fontWeight: 600, margin: "0 0 10px" }}>Students only</p>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 26, fontWeight: 700, margin: "0 0 10px" }}>Your class link unlocks the exams.</h1>
          <p style={{ fontSize: 14.5, color: C.body, lineHeight: 1.65, margin: 0 }}>
            Exams are open to Sake Studies Center students for two weeks after
            their class. Use the personal class link from your follow-up email —
            or contact us if yours has expired or gone missing.
          </p>
        </div>
        {certs.length > 0 && (
          <div style={{ maxWidth: 520, margin: "28px auto 0" }}>
            <h2 style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>Your certificates</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {certs.map((cert) => (
                <Link
                  key={cert.verify_code}
                  to={`/certificate/${cert.verify_code}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.paper, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, padding: "13px 16px", textDecoration: "none", color: C.ink }}
                >
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{cert.attempts.exams.title}</span>
                  <span style={{ fontFamily: fontMono, fontSize: 12, color: C.mist }}>{cert.verify_code}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const hasExamAccess = access !== null;

  return (
    <div>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brandGreen, fontWeight: 600, marginBottom: 8 }}>Assessment</p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 10px" }}>Test your sake knowledge.</h1>
      <p style={{ color: C.body, maxWidth: 520, lineHeight: 1.6, marginBottom: !hasExamAccess || access.admin ? 36 : 8 }}>
        Practice freely with instant feedback, or sit the timed certification
        exam. Your results are recorded and a certificate is issued on passing.
      </p>
      {hasExamAccess && !access.admin && (
        <p style={{ fontFamily: fontMono, fontSize: 12, color: C.green, marginBottom: 36 }}>
          {access.name} · exam access until{" "}
          {new Date(access.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
        </p>
      )}
      {courses.length > 0 && (
        <div style={{ marginBottom: 36 }}>
          <h2 style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>Your courses</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
            {courses.map((course) => (
              <div key={course.slug} style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${C.brandGreen}`, borderRadius: 4, padding: 24, display: "flex", flexDirection: "column" }}>
                <h2 style={{ fontFamily: fontDisplay, fontSize: 21, fontWeight: 700, margin: "0 0 10px" }}>{course.title}</h2>
                <p style={{ fontSize: 14, lineHeight: 1.55, color: C.body, flex: 1, margin: "0 0 16px" }}>
                  Watch the video modules at your own pace, then take the
                  completion quiz to earn your certificate.
                </p>
                <button
                  onClick={() => navigate(`/course/${course.slug}`)}
                  style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
                >
                  Go to course
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      {!hasExamAccess ? null : (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        {exams.map((exam) => {
          const isCert = exam.mode === "certification";
          const minutes = exam.time_limit_seconds ? Math.round(exam.time_limit_seconds / 60) : null;
          return (
            <div key={exam.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${isCert ? C.hanko : C.indigo}`, borderRadius: 4, padding: 24, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
                <h2 style={{ fontFamily: fontDisplay, fontSize: 21, fontWeight: 700, margin: 0 }}>{exam.title}</h2>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, color: isCert ? C.hanko : C.indigo, border: "1px solid currentColor", padding: "3px 8px", borderRadius: 2, whiteSpace: "nowrap" }}>
                  {isCert ? "Timed" : "Untimed"}
                </span>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.55, color: C.body, flex: 1 }}>
                {isCert
                  ? `${exam.question_count} randomized questions in ${minutes} minutes. Score ${exam.pass_pct}% or higher to earn your certificate.`
                  : "Work through the full question bank at your own pace. Each answer is explained as you go."}
              </p>
              <p style={{ fontFamily: fontMono, fontSize: 11.5, color: C.mist, margin: "10px 0 16px" }}>
                {isCert
                  ? `${minutes}:00 limit · ${exam.pass_pct}% to pass · recorded${exam.max_attempts ? ` · ${exam.max_attempts} attempts` : ""}`
                  : "untimed · instant feedback"}
              </p>
              <button
                onClick={() => navigate(`/exam/${exam.slug}`)}
                style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
              >
                {isCert ? "Begin exam" : "Start practicing"}
              </button>
            </div>
          );
        })}
      </div>
      )}
      {certs.length > 0 && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, margin: "0 0 12px" }}>Your certificates</h2>
          <div style={{ display: "grid", gap: 8 }}>
            {certs.map((cert) => (
              <Link
                key={cert.verify_code}
                to={`/certificate/${cert.verify_code}`}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: C.paper, border: `1px solid ${C.line}`, borderLeft: `3px solid ${C.gold}`, borderRadius: 4, padding: "13px 16px", textDecoration: "none", color: C.ink }}
              >
                <span style={{ fontSize: 14, fontWeight: 600 }}>{cert.attempts.exams.title}</span>
                <span style={{ fontFamily: fontMono, fontSize: 12, color: C.mist }}>
                  {cert.verify_code} · {new Date(cert.issued_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
