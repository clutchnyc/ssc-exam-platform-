import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";
import { AdminTabs } from "./AdminQuestionsPage";

// Admin class management — create a class after it wraps, copy its invite
// link into the follow-up email, watch who enrolls, extend or cut off
// access. Exam access ends at expires_at (default class day + 14 days).

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no I/L/O/0/1

function makeInviteCode() {
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return code;
}

/** class day + 14 days, end of that day local time */
function defaultExpiry(classDate) {
  const d = new Date(`${classDate}T23:59:59`);
  d.setDate(d.getDate() + 14);
  return d;
}

const toDateInput = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function AdminClassesPage() {
  const { session, profile, profileLoading } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [classes, setClasses] = useState(null);
  const [students, setStudents] = useState({}); // class_id -> rows | undefined
  const [expanded, setExpanded] = useState(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [classDate, setClassDate] = useState(toDateInput(new Date().toISOString()));
  const [expiry, setExpiry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    loadClasses();
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadClasses() {
    const { data } = await supabase
      .from("classes")
      .select("*, enrollments(count)")
      .order("class_date", { ascending: false });
    setClasses(data ?? []);
  }

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

  async function createClass() {
    setError("");
    if (!name.trim()) return setError("Give the class a name.");
    if (!classDate) return setError("Pick the class date.");
    const expiresAt = expiry
      ? new Date(`${expiry}T23:59:59`)
      : defaultExpiry(classDate);
    setBusy(true);
    const { error: err } = await supabase.from("classes").insert({
      name: name.trim(),
      class_date: classDate,
      invite_code: makeInviteCode(),
      expires_at: expiresAt.toISOString(),
    });
    setBusy(false);
    if (err) return setError(err.message);
    setCreating(false);
    setName("");
    setExpiry("");
    loadClasses();
  }

  async function toggleActive(cls) {
    await supabase.from("classes").update({ is_active: !cls.is_active }).eq("id", cls.id);
    loadClasses();
  }

  async function updateExpiry(cls, dateStr) {
    if (!dateStr) return;
    await supabase.from("classes").update({ expires_at: new Date(`${dateStr}T23:59:59`).toISOString() }).eq("id", cls.id);
    loadClasses();
  }

  async function toggleStudents(cls) {
    if (expanded === cls.id) return setExpanded(null);
    setExpanded(cls.id);
    if (!students[cls.id]) {
      const { data } = await supabase
        .from("enrollments")
        .select("joined_at, profiles:user_id(full_name)")
        .eq("class_id", cls.id)
        .order("joined_at", { ascending: true });
      setStudents((s) => ({ ...s, [cls.id]: data ?? [] }));
    }
  }

  function copyLink(cls) {
    const url = `${window.location.origin}/join/${cls.invite_code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(cls.id);
      setTimeout(() => setCopied((c) => (c === cls.id ? null : c)), 2000);
    });
  }

  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.12em", color: C.mist, margin: "0 0 5px",
  };
  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 14,
    border: `1px solid ${C.line}`, borderRadius: 0, fontFamily: fontBody,
    background: C.paper, color: C.ink,
  };

  return (
    <div>
      <AdminTabs active="classes" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, fontWeight: 600, margin: "0 0 6px" }}>Admin</p>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 700, margin: 0 }}>Classes</h1>
        </div>
        <button
          onClick={() => { setCreating((v) => !v); setError(""); }}
          style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
        >
          + New class
        </button>
      </div>

      {creating && (
        <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 20, marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Class name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sake Server Class — Jul 16" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Class date</label>
              <input type="date" value={classDate} onChange={(e) => setClassDate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Access ends</label>
              <input type="date" value={expiry || (classDate ? toDateInput(defaultExpiry(classDate).toISOString()) : "")} onChange={(e) => setExpiry(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <p style={{ fontSize: 12, color: C.mist, margin: "10px 0 0" }}>
            Access ends at the end of that day — defaults to 14 days after the class.
          </p>
          {error && <p style={{ fontSize: 13, color: C.hanko, margin: "10px 0 0" }}>{error}</p>}
          <button
            onClick={createClass}
            disabled={busy}
            style={{ marginTop: 14, background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "10px 24px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Creating…" : "Create class & get link"}
          </button>
        </div>
      )}

      {classes === null ? (
        <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 40 }}>Loading…</p>
      ) : classes.length === 0 ? (
        <p style={{ color: C.mist, fontSize: 14 }}>
          No classes yet. Create one after a class wraps, then paste its invite
          link into your follow-up email — students click it to unlock their exams.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {classes.map((cls) => {
            const expired = new Date(cls.expires_at).getTime() < Date.now();
            const count = cls.enrollments?.[0]?.count ?? 0;
            return (
              <div key={cls.id} style={{ background: C.paper, border: `1px solid ${C.line}`, padding: "14px 16px", opacity: cls.is_active ? 1 : 0.55 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <p style={{ fontSize: 14.5, fontWeight: 600, margin: 0 }}>{cls.name}</p>
                    <p style={{ fontFamily: fontMono, fontSize: 11.5, color: expired ? C.hanko : C.mist, margin: "4px 0 0" }}>
                      class {cls.class_date} · access until {toDateInput(cls.expires_at)}
                      {expired ? " · ENDED" : ""}
                      {!cls.is_active ? " · DEACTIVATED" : ""}
                    </p>
                  </div>
                  <button onClick={() => toggleStudents(cls)} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 0, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, color: C.ink }}>
                    {count} student{count === 1 ? "" : "s"} {expanded === cls.id ? "▴" : "▾"}
                  </button>
                  <button onClick={() => copyLink(cls)} style={{ background: copied === cls.id ? C.greenBg : "transparent", border: `1px solid ${copied === cls.id ? C.brandGreen : C.line}`, borderRadius: 0, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, color: copied === cls.id ? C.green : C.ink }}>
                    {copied === cls.id ? "✓ Copied" : "Copy invite link"}
                  </button>
                  <button onClick={() => toggleActive(cls)} style={{ background: "transparent", border: `1px solid ${cls.is_active ? C.line : C.brandGreen}`, borderRadius: 0, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, color: cls.is_active ? C.hanko : C.green }}>
                    {cls.is_active ? "Deactivate" : "Reactivate"}
                  </button>
                </div>
                {expanded === cls.id && (
                  <div style={{ marginTop: 12, borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.mist }}>Extend access to</span>
                      <input
                        type="date"
                        defaultValue={toDateInput(cls.expires_at)}
                        onChange={(e) => updateExpiry(cls, e.target.value)}
                        style={{ ...inputStyle, width: "auto", padding: "5px 8px", fontSize: 13 }}
                      />
                    </div>
                    {students[cls.id] === undefined ? (
                      <p style={{ fontFamily: fontMono, fontSize: 12, color: C.mist, margin: 0 }}>Loading…</p>
                    ) : students[cls.id].length === 0 ? (
                      <p style={{ fontSize: 13, color: C.mist, margin: 0 }}>No students have used the link yet.</p>
                    ) : (
                      <div style={{ display: "grid", gap: 4 }}>
                        {students[cls.id].map((s, i) => (
                          <p key={i} style={{ fontSize: 13.5, margin: 0, display: "flex", justifyContent: "space-between", gap: 10 }}>
                            <span style={{ fontWeight: 600 }}>{s.profiles?.full_name ?? "—"}</span>
                            <span style={{ fontFamily: fontMono, fontSize: 11.5, color: C.mist }}>
                              joined {new Date(s.joined_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
