import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

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
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.hanko, fontWeight: 600, marginBottom: 8 }}>Assessment</p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 10px" }}>Test your sake knowledge.</h1>
      <p style={{ color: C.body, maxWidth: 460, lineHeight: 1.6, margin: "0 auto 32px" }}>
        Practice freely with instant feedback, or sit the timed certification
        exam. Sign in with your email to begin — results are recorded and a
        certificate is issued on passing.
      </p>
      <Link
        to="/login"
        style={{ display: "inline-block", background: C.indigo, color: "#fff", borderRadius: 3, padding: "13px 34px", fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: fontBody }}
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
          style={{ width: "100%", marginTop: 22, background: C.indigo, opacity: saving || !name.trim() ? 0.45 : 1, color: "#fff", border: "none", borderRadius: 3, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function Catalog() {
  const navigate = useNavigate();
  const [exams, setExams] = useState(null);
  const [certs, setCerts] = useState([]);

  useEffect(() => {
    supabase
      .from("exams")
      .select("*")
      .eq("is_published", true)
      .order("mode", { ascending: false }) // practice first
      .then(({ data }) => setExams(data ?? []));
    supabase
      .from("certificates")
      .select("verify_code, issued_at, attempts:attempt_id(exams:exam_id(title))")
      .order("issued_at", { ascending: false })
      .then(({ data }) => setCerts(data ?? []));
  }, []);

  if (!exams) return <Loading />;

  return (
    <div>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.hanko, fontWeight: 600, marginBottom: 8 }}>Assessment</p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 10px" }}>Test your sake knowledge.</h1>
      <p style={{ color: C.body, maxWidth: 520, lineHeight: 1.6, marginBottom: 36 }}>
        Practice freely with instant feedback, or sit the timed certification
        exam. Your results are recorded and a certificate is issued on passing.
      </p>
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
                style={{ background: isCert ? C.hanko : C.indigo, color: "#fff", border: "none", borderRadius: 3, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
              >
                {isCert ? "Begin exam" : "Start practicing"}
              </button>
            </div>
          );
        })}
      </div>
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
