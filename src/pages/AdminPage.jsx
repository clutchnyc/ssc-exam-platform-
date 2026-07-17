import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";
import { AdminTabs } from "./AdminQuestionsPage";

// Admin results dashboard — RLS lets admins read every attempt/profile;
// non-admins get an empty result set server-side either way, but we
// gate the UI on profile.role for a clear message.
export default function AdminPage() {
  const { session, profile, profileLoading } = useAuth();
  const [rows, setRows] = useState(null);
  const [examFilter, setExamFilter] = useState("all");

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("attempts")
      .select("id, started_at, submitted_at, score_pct, passed, flagged_late, profiles:user_id(full_name), exams:exam_id(title, mode), certificates(verify_code)")
      .order("started_at", { ascending: false })
      .limit(1000)
      .then(({ data }) => setRows(data ?? []));
  }, [isAdmin]);

  const examTitles = useMemo(
    () => [...new Set((rows ?? []).map((r) => r.exams?.title).filter(Boolean))],
    [rows],
  );
  const visible = useMemo(
    () => (rows ?? []).filter((r) => examFilter === "all" || r.exams?.title === examFilter),
    [rows, examFilter],
  );

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

  function exportCsv() {
    const header = ["started_at", "submitted_at", "student", "exam", "mode", "score_pct", "passed", "flagged_late", "certificate_code"];
    const lines = visible.map((r) =>
      [
        r.started_at,
        r.submitted_at ?? "",
        r.profiles?.full_name ?? "",
        r.exams?.title ?? "",
        r.exams?.mode ?? "",
        r.score_pct ?? "",
        r.passed === null ? "" : r.passed,
        r.flagged_late,
        r.certificates?.verify_code ?? "",
      ]
        .map((v) => {
          const s = String(v);
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(","),
    );
    const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `ssc-exam-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const fmt = (ts) =>
    ts ? new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

  return (
    <div>
      <AdminTabs active="results" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, fontWeight: 600, margin: "0 0 6px" }}>Admin</p>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 700, margin: 0 }}>Exam results</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={examFilter}
            onChange={(e) => setExamFilter(e.target.value)}
            style={{ padding: "9px 12px", fontSize: 13.5, fontFamily: fontBody, border: `1px solid ${C.line}`, borderRadius: 3, background: C.paper, color: C.ink }}
          >
            <option value="all">All exams</option>
            {examTitles.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={exportCsv}
            disabled={visible.length === 0}
            style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, opacity: visible.length === 0 ? 0.45 : 1 }}
          >
            Export CSV ({visible.length})
          </button>
        </div>
      </div>

      {rows === null ? (
        <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 40 }}>Loading…</p>
      ) : visible.length === 0 ? (
        <p style={{ color: C.mist, fontSize: 14 }}>No attempts yet.</p>
      ) : (
        <div style={{ overflowX: "auto", background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13.5 }}>
            <thead>
              <tr>
                {["Student", "Exam", "Started", "Score", "Result", "Certificate"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "11px 14px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: C.mist, borderBottom: `1px solid ${C.line}`, whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const isCert = r.exams?.mode === "certification";
                const status = !r.submitted_at
                  ? { label: "In progress", color: C.mist }
                  : r.flagged_late
                  ? { label: "Late", color: C.gold }
                  : !isCert
                  ? { label: "Completed", color: C.body }
                  : r.passed
                  ? { label: "Passed", color: C.green }
                  : { label: "Failed", color: C.hanko };
                return (
                  <tr key={r.id} style={{ borderBottom: `1px solid ${C.line}` }}>
                    <td style={{ padding: "11px 14px", fontWeight: 600, whiteSpace: "nowrap" }}>{r.profiles?.full_name ?? "—"}</td>
                    <td style={{ padding: "11px 14px" }}>
                      {r.exams?.title ?? "—"}{" "}
                      {isCert && <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C.hanko, border: "1px solid currentColor", padding: "1px 5px", borderRadius: 2, marginLeft: 4 }}>cert</span>}
                    </td>
                    <td style={{ padding: "11px 14px", color: C.mist, whiteSpace: "nowrap" }}>{fmt(r.started_at)}</td>
                    <td style={{ padding: "11px 14px", fontFamily: fontMono }}>{r.score_pct != null ? `${r.score_pct}%` : "—"}</td>
                    <td style={{ padding: "11px 14px", fontWeight: 600, color: status.color, whiteSpace: "nowrap" }}>{status.label}</td>
                    <td style={{ padding: "11px 14px", fontFamily: fontMono, fontSize: 12, color: C.mist, whiteSpace: "nowrap" }}>
                      {r.certificates?.verify_code ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
