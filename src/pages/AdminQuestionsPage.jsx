import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

// Admin question authoring — create/edit MC, short-answer, and image
// questions entirely in-app. Images upload to the question-images bucket
// (RLS: admin-only writes, public read). Questions are deactivated rather
// than deleted so past attempts keep their references.

const emptyForm = {
  id: null,
  exam_id: "",
  question_type: "mc",
  prompt: "",
  options: ["", "", "", ""],
  correct_option: 0,
  accepted_answers: "",
  explanation: "",
  image_url: null,
  is_active: true,
};

export default function AdminQuestionsPage() {
  const { session, profile, profileLoading } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState("");
  const [questions, setQuestions] = useState(null);
  const [form, setForm] = useState(null); // null = list view
  const [imageFile, setImageFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from("exams")
      .select("id, title, mode")
      .order("mode", { ascending: false })
      .then(({ data }) => {
        setExams(data ?? []);
        if (data?.length && !examId) setExamId(data[0].id);
      });
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isAdmin || !examId) return;
    loadQuestions();
  }, [isAdmin, examId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadQuestions() {
    const { data } = await supabase
      .from("questions")
      .select("*")
      .eq("exam_id", examId)
      .order("created_at", { ascending: true });
    setQuestions(data ?? []);
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

  function startNew() {
    setForm({ ...emptyForm, exam_id: examId });
    setImageFile(null);
    setError("");
  }

  function startEdit(q) {
    setForm({
      id: q.id,
      exam_id: q.exam_id,
      question_type: q.question_type,
      prompt: q.prompt,
      options: q.options ?? ["", "", "", ""],
      correct_option: q.correct_option ?? 0,
      accepted_answers: (q.accepted_answers ?? []).join("\n"),
      explanation: q.explanation ?? "",
      image_url: q.image_url,
      is_active: q.is_active,
    });
    setImageFile(null);
    setError("");
  }

  async function toggleActive(q) {
    setError("");
    const { error: err } = await supabase
      .from("questions")
      .update({ is_active: !q.is_active })
      .eq("id", q.id);
    if (err) setError(err.message);
    else loadQuestions();
  }

  async function save() {
    setError("");
    const prompt = form.prompt.trim();
    if (!prompt) return setError("The question prompt is required.");

    const row = {
      exam_id: form.exam_id,
      question_type: form.question_type,
      prompt,
      explanation: form.explanation.trim() || null,
      is_active: form.is_active,
    };

    if (form.question_type === "mc") {
      const options = form.options.map((o) => o.trim()).filter(Boolean);
      if (options.length < 2) return setError("Multiple choice needs at least 2 options.");
      if (form.correct_option >= options.length) {
        return setError("Pick which option is correct.");
      }
      row.options = options;
      row.correct_option = form.correct_option;
      row.accepted_answers = null;
    } else {
      const answers = form.accepted_answers.split("\n").map((a) => a.trim()).filter(Boolean);
      if (answers.length === 0) return setError("Add at least one accepted answer (one per line).");
      row.accepted_answers = answers;
      row.options = null;
      row.correct_option = null;
    }

    setSaving(true);
    try {
      // Upload a newly chosen image first (admin-only bucket policy)
      if (imageFile) {
        const ext = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
        const path = `${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("question-images")
          .upload(path, imageFile, { contentType: imageFile.type || "image/jpeg" });
        if (upErr) throw upErr;
        row.image_url = supabase.storage.from("question-images").getPublicUrl(path).data.publicUrl;
      } else {
        row.image_url = form.image_url; // unchanged or removed (null)
      }

      const { error: err } = form.id
        ? await supabase.from("questions").update(row).eq("id", form.id)
        : await supabase.from("questions").insert(row);
      if (err) throw err;

      setForm(null);
      setImageFile(null);
      loadQuestions();
    } catch (err) {
      setError(err.message || "Save failed — try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14,
    border: `1px solid ${C.line}`, borderRadius: 0, fontFamily: fontBody,
    background: C.paper, color: C.ink,
  };
  const labelStyle = {
    display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
    letterSpacing: "0.12em", color: C.mist, margin: "18px 0 6px",
  };

  // ——— Edit / create form ———
  if (form) {
    const isMc = form.question_type === "mc";
    return (
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <AdminTabs active="questions" />
        <h1 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>
          {form.id ? "Edit question" : "New question"}
        </h1>
        <p style={{ fontSize: 13, color: C.mist, margin: "0 0 8px" }}>
          {exams.find((e) => e.id === form.exam_id)?.title}
        </p>

        <label style={labelStyle}>Question type</label>
        <div style={{ display: "flex", gap: 8 }}>
          {[["mc", "Multiple choice"], ["short_answer", "Short answer"]].map(([val, label]) => (
            <button
              key={val}
              onClick={() => setForm((f) => ({ ...f, question_type: val }))}
              style={{
                flex: 1, padding: "10px 0", fontSize: 13.5, fontWeight: 600, cursor: "pointer",
                fontFamily: fontBody, borderRadius: 0,
                border: `1.5px solid ${form.question_type === val ? C.brandGreen : C.line}`,
                background: form.question_type === val ? C.greenBg : C.paper,
                color: form.question_type === val ? C.green : C.body,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <label style={labelStyle}>Prompt</label>
        <textarea
          value={form.prompt}
          onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
          placeholder="e.g. What piece of brewing equipment is pictured here?"
        />

        <label style={labelStyle}>Image (optional)</label>
        {form.image_url && !imageFile && (
          <div style={{ marginBottom: 8 }}>
            <img src={form.image_url} alt="" style={{ maxWidth: 240, display: "block", border: `1px solid ${C.line}`, marginBottom: 6 }} />
            <button
              onClick={() => setForm((f) => ({ ...f, image_url: null }))}
              style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 0, padding: "5px 12px", fontSize: 12, cursor: "pointer", fontFamily: fontBody, color: C.hanko }}
            >
              Remove image
            </button>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
          style={{ fontSize: 13, fontFamily: fontBody }}
        />
        {imageFile && <p style={{ fontSize: 12, color: C.green, margin: "6px 0 0" }}>Will upload: {imageFile.name}</p>}

        {isMc ? (
          <>
            <label style={labelStyle}>Options — select the correct one</label>
            <div style={{ display: "grid", gap: 8 }}>
              {form.options.map((opt, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="correct"
                    checked={form.correct_option === i}
                    onChange={() => setForm((f) => ({ ...f, correct_option: i }))}
                    style={{ accentColor: C.brandGreen, width: 16, height: 16, flexShrink: 0 }}
                  />
                  <input
                    value={opt}
                    onChange={(e) => setForm((f) => {
                      const options = [...f.options];
                      options[i] = e.target.value;
                      return { ...f, options };
                    })}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    style={inputStyle}
                  />
                  {form.options.length > 2 && (
                    <button
                      onClick={() => setForm((f) => {
                        const options = f.options.filter((_, j) => j !== i);
                        return { ...f, options, correct_option: Math.min(f.correct_option, options.length - 1) };
                      })}
                      title="Remove option"
                      style={{ background: "transparent", border: "none", color: C.mist, fontSize: 18, cursor: "pointer", padding: "0 4px" }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
            {form.options.length < 6 && (
              <button
                onClick={() => setForm((f) => ({ ...f, options: [...f.options, ""] }))}
                style={{ marginTop: 8, background: "transparent", border: `1px dashed ${C.line}`, borderRadius: 0, padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: fontBody, color: C.body }}
              >
                + Add option
              </button>
            )}
          </>
        ) : (
          <>
            <label style={labelStyle}>Accepted answers — one per line</label>
            <textarea
              value={form.accepted_answers}
              onChange={(e) => setForm((f) => ({ ...f, accepted_answers: e.target.value }))}
              rows={3}
              style={{ ...inputStyle, resize: "vertical", fontFamily: fontMono, fontSize: 13.5 }}
              placeholder={"koji\nkoji-kin\n麹"}
            />
            <p style={{ fontSize: 12, color: C.mist, margin: "6px 0 0", lineHeight: 1.5 }}>
              Grading ignores capitalization, spaces, hyphens, punctuation, and
              accents automatically (kōji = koji), so you only need genuinely
              different spellings here.
            </p>
          </>
        )}

        <label style={labelStyle}>Explanation — shown in practice mode (optional)</label>
        <textarea
          value={form.explanation}
          onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
          rows={2}
          style={{ ...inputStyle, resize: "vertical" }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 18, fontSize: 14, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            style={{ accentColor: C.brandGreen, width: 16, height: 16 }}
          />
          Active — appears in exams
        </label>

        {error && <p style={{ fontSize: 13, color: C.hanko, marginTop: 14 }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button
            onClick={save}
            disabled={saving}
            style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, opacity: saving ? 0.5 : 1 }}
          >
            {saving ? "Saving…" : form.id ? "Save changes" : "Create question"}
          </button>
          <button
            onClick={() => { setForm(null); setImageFile(null); setError(""); }}
            disabled={saving}
            style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 0, padding: "12px 20px", fontSize: 14, cursor: "pointer", fontFamily: fontBody, color: C.ink }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // ——— List view ———
  return (
    <div>
      <AdminTabs active="questions" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
        <div>
          <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, fontWeight: 600, margin: "0 0 6px" }}>Admin</p>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 700, margin: 0 }}>Questions</h1>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <select
            value={examId}
            onChange={(e) => setExamId(e.target.value)}
            style={{ padding: "9px 12px", fontSize: 13.5, fontFamily: fontBody, border: `1px solid ${C.line}`, borderRadius: 0, background: C.paper, color: C.ink }}
          >
            {exams.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
          <button
            onClick={startNew}
            style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "10px 18px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
          >
            + New question
          </button>
        </div>
      </div>

      {error && <p style={{ fontSize: 13, color: C.hanko, marginBottom: 12 }}>{error}</p>}

      {questions === null ? (
        <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 40 }}>Loading…</p>
      ) : questions.length === 0 ? (
        <p style={{ color: C.mist, fontSize: 14 }}>No questions on this exam yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {questions.map((q) => (
            <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 12, background: C.paper, border: `1px solid ${C.line}`, padding: "12px 14px", opacity: q.is_active ? 1 : 0.55 }}>
              {q.image_url && (
                <img src={q.image_url} alt="" style={{ width: 52, height: 36, objectFit: "cover", border: `1px solid ${C.line}`, flexShrink: 0 }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.prompt}</p>
                <p style={{ fontFamily: fontMono, fontSize: 11, color: C.mist, margin: "3px 0 0" }}>
                  {q.question_type === "mc" ? `multiple choice · ${(q.options ?? []).length} options` : `short answer · ${(q.accepted_answers ?? []).length} accepted`}
                  {q.image_url ? " · image" : ""}
                  {!q.is_active ? " · INACTIVE" : ""}
                </p>
              </div>
              <button
                onClick={() => startEdit(q)}
                style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 0, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, color: C.ink, flexShrink: 0 }}
              >
                Edit
              </button>
              <button
                onClick={() => toggleActive(q)}
                style={{ background: "transparent", border: `1px solid ${q.is_active ? C.line : C.brandGreen}`, borderRadius: 0, padding: "7px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, color: q.is_active ? C.hanko : C.green, flexShrink: 0 }}
              >
                {q.is_active ? "Deactivate" : "Activate"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AdminTabs({ active }) {
  const tab = (to, key, label) => (
    <Link
      to={to}
      style={{
        padding: "8px 16px", fontSize: 13, fontWeight: 600, textDecoration: "none",
        color: active === key ? "#fff" : C.body,
        background: active === key ? C.brandGreen : "transparent",
        border: `1px solid ${active === key ? C.brandGreen : C.line}`,
      }}
    >
      {label}
    </Link>
  );
  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 26 }}>
      {tab("/admin", "results", "Results")}
      {tab("/admin/questions", "questions", "Questions")}
    </div>
  );
}
