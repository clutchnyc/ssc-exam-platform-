import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";
import { AdminTabs } from "./AdminQuestionsPage";

// Admin exam settings — time limit, question count, pass mark, attempt
// limit, publish state. RLS: exams_admin_update.
export default function AdminExamsPage() {
  const { session, profile, profileLoading } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [exams, setExams] = useState(null); // [{...exam, _saving, _saved, _error}]

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("exams")
      .select("*")
      .order("mode", { ascending: false })
      .then(({ data }) => setExams(data ?? []));
  }, [isAdmin]);

  if (session === undefined || profileLoading) {
    return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Loading…</p>;
  }
  if (!session || !isAdmin) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        This page is for Sake Studies Center staff.
      </p>
    );
  }

  function patch(id, fields) {
    // _saved resets on any edit unless the caller sets it explicitly
    setExams((list) => list.map((e) => (e.id === id ? { ...e, _saved: false, ...fields } : e)));
  }

  async function save(exam) {
    const minutes = exam._minutes ?? (exam.time_limit_seconds != null ? exam.time_limit_seconds / 60 : "");
    const questionCount = parseInt(exam.question_count, 10);
    const passPct = parseInt(exam.pass_pct, 10);

    if (!String(exam.title).trim()) return patch(exam.id, { _error: "Title is required." });
    if (!Number.isInteger(questionCount) || questionCount < 1) return patch(exam.id, { _error: "Questions per attempt must be at least 1." });
    if (!Number.isInteger(passPct) || passPct < 1 || passPct > 100) return patch(exam.id, { _error: "Pass mark must be 1–100." });

    let timeLimitSeconds = null;
    if (String(minutes).trim() !== "") {
      const m = Number(minutes);
      if (!Number.isFinite(m) || m <= 0) return patch(exam.id, { _error: "Time limit must be a positive number of minutes (or blank for untimed)." });
      timeLimitSeconds = Math.round(m * 60);
    }

    let maxAttempts = null;
    if (String(exam.max_attempts ?? "").trim() !== "") {
      maxAttempts = parseInt(exam.max_attempts, 10);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1) return patch(exam.id, { _error: "Attempt limit must be at least 1 (or blank for unlimited)." });
    }

    patch(exam.id, { _saving: true, _error: null });
    const { error } = await supabase
      .from("exams")
      .update({
        title: exam.title.trim(),
        question_count: questionCount,
        time_limit_seconds: timeLimitSeconds,
        pass_pct: passPct,
        max_attempts: maxAttempts,
        is_published: exam.is_published,
      })
      .eq("id", exam.id);
    patch(exam.id, { _saving: false, _saved: !error, _error: error?.message ?? null, time_limit_seconds: timeLimitSeconds, max_attempts: maxAttempts });
  }

  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.12em", color: C.mist, margin: "0 0 5px",
  };
  const numStyle = {
    width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 14,
    border: `1px solid ${C.line}`, borderRadius: 0, fontFamily: fontBody,
    background: C.paper, color: C.ink,
  };

  return (
    <div>
      <AdminTabs active="exams" />
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, fontWeight: 600, margin: "0 0 6px" }}>Admin</p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 700, margin: "0 0 20px" }}>Exam settings</h1>

      {exams === null ? (
        <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 40 }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          {exams.map((exam) => {
            const isCert = exam.mode === "certification";
            const minutes = exam._minutes ?? (exam.time_limit_seconds != null ? String(exam.time_limit_seconds / 60) : "");
            return (
              <div key={exam.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${isCert ? C.hanko : C.indigo}`, padding: 22 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, color: isCert ? C.hanko : C.indigo }}>
                    {isCert ? "Certification (timed, recorded)" : "Practice (untimed feedback)"}
                  </span>
                  <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={exam.is_published}
                      onChange={(e) => patch(exam.id, { is_published: e.target.checked })}
                      style={{ accentColor: C.brandGreen, width: 15, height: 15 }}
                    />
                    Published — visible to students
                  </label>
                </div>

                <label style={labelStyle}>Title</label>
                <input
                  value={exam.title}
                  onChange={(e) => patch(exam.id, { title: e.target.value })}
                  style={{ ...numStyle, marginBottom: 14 }}
                />

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
                  <div>
                    <label style={labelStyle}>Questions / attempt</label>
                    <input
                      type="number" min="1"
                      value={exam.question_count ?? ""}
                      onChange={(e) => patch(exam.id, { question_count: e.target.value })}
                      style={numStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Time limit (minutes)</label>
                    <input
                      type="number" min="1" step="1"
                      value={minutes}
                      placeholder="untimed"
                      onChange={(e) => patch(exam.id, { _minutes: e.target.value })}
                      style={numStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Pass mark (%)</label>
                    <input
                      type="number" min="1" max="100"
                      value={exam.pass_pct ?? ""}
                      onChange={(e) => patch(exam.id, { pass_pct: e.target.value })}
                      style={numStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Attempt limit</label>
                    <input
                      type="number" min="1"
                      value={exam.max_attempts ?? ""}
                      placeholder="unlimited"
                      onChange={(e) => patch(exam.id, { max_attempts: e.target.value })}
                      style={numStyle}
                    />
                  </div>
                </div>

                <p style={{ fontSize: 12, color: C.mist, margin: "12px 0 0", lineHeight: 1.5 }}>
                  {isCert
                    ? "Each attempt draws that many random active questions. Blank time limit = untimed; blank attempt limit = unlimited."
                    : "Practice mode always uses every active question, so \"questions / attempt\" is ignored here. Pass mark is informational — practice attempts aren't pass/fail."}
                </p>

                {exam._error && <p style={{ fontSize: 13, color: C.hanko, margin: "12px 0 0" }}>{exam._error}</p>}

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 16 }}>
                  <button
                    onClick={() => save(exam)}
                    disabled={exam._saving}
                    style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "10px 24px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, opacity: exam._saving ? 0.5 : 1 }}
                  >
                    {exam._saving ? "Saving…" : "Save settings"}
                  </button>
                  {exam._saved && <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>✓ Saved</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
