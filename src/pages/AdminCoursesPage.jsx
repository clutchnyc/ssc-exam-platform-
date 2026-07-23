import { useEffect, useState } from "react";
import { invokeFn, supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";
import { AdminTabs } from "./AdminQuestionsPage";

// Admin course & module management. Workflow: upload the video in the
// Bunny dashboard, then paste its GUID here — "Look up" validates it via
// bunny-video-info and auto-fills title/duration. RLS: courses_admin_*,
// modules_admin_all.

const labelStyle = {
  display: "block", fontSize: 11, fontWeight: 600, textTransform: "uppercase",
  letterSpacing: "0.12em", color: C.mist, margin: "0 0 5px",
};
const inputStyle = {
  width: "100%", boxSizing: "border-box", padding: "9px 10px", fontSize: 14,
  border: `1px solid ${C.line}`, borderRadius: 0, fontFamily: fontBody,
  background: C.paper, color: C.ink,
};
const btnPrimary = {
  background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0,
  padding: "10px 24px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody,
};
const btnGhost = {
  background: "transparent", border: `1px solid ${C.line}`, borderRadius: 0,
  padding: "8px 14px", fontSize: 12.5, cursor: "pointer", fontFamily: fontBody, color: C.ink,
};

/** Upload a handout to the private course-materials bucket. */
async function uploadResource(courseId, file) {
  const safe = file.name.replace(/[^A-Za-z0-9._-]+/g, "_");
  const path = `${courseId}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage
    .from("course-materials")
    .upload(path, file, { contentType: file.type || "application/pdf" });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return { path, name: file.name };
}

/** Best-effort delete of a replaced/removed handout. */
function removeResourceQuietly(path) {
  if (path) supabase.storage.from("course-materials").remove([path]);
}

export default function AdminCoursesPage() {
  const { session, profile, profileLoading } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [courses, setCourses] = useState(null);
  const [selected, setSelected] = useState(null); // course id
  const [creating, setCreating] = useState(false);

  async function loadCourses() {
    const { data } = await supabase
      .from("courses")
      .select("*")
      .order("created_at");
    setCourses(data ?? []);
    return data ?? [];
  }
  useEffect(() => {
    if (isAdmin) loadCourses();
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

  const course = courses?.find((c) => c.id === selected) ?? null;

  return (
    <div>
      <AdminTabs active="courses" />
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, fontWeight: 600, margin: "0 0 6px" }}>Admin</p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 700, margin: "0 0 20px" }}>Courses</h1>

      {courses === null ? (
        <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 40 }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {courses.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c.id === selected ? null : c.id)}
                style={{
                  ...btnGhost,
                  padding: "10px 16px", fontSize: 13.5, fontWeight: 600,
                  background: c.id === selected ? C.brandGreen : "transparent",
                  color: c.id === selected ? "#fff" : C.ink,
                  border: `1px solid ${c.id === selected ? C.brandGreen : C.line}`,
                }}
              >
                {c.title}
                <span style={{ fontFamily: fontMono, fontSize: 10.5, marginLeft: 8, opacity: 0.75 }}>
                  {c.track}{c.is_published ? "" : " · draft"}
                </span>
              </button>
            ))}
            <button onClick={() => setCreating((v) => !v)} style={btnGhost}>
              {creating ? "Cancel" : "+ New course"}
            </button>
          </div>

          {creating && (
            <NewCourseCard
              onCreated={async (id) => {
                setCreating(false);
                await loadCourses();
                setSelected(id);
              }}
            />
          )}

          {course && (
            <CourseEditor
              key={course.id}
              course={course}
              onChanged={loadCourses}
            />
          )}
          {!course && !creating && (
            <p style={{ fontSize: 13.5, color: C.mist }}>Select a course to edit its settings and modules.</p>
          )}
        </div>
      )}
    </div>
  );
}

function NewCourseCard({ onCreated }) {
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function create() {
    const t = title.trim();
    if (!t) return setError("Title is required.");
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    setSaving(true);
    setError("");
    const { data, error: err } = await supabase
      .from("courses")
      .insert({ title: t, slug, track: "consumer", delivery: "video", is_published: false })
      .select("id")
      .single();
    setSaving(false);
    if (err) return setError(err.code === "23505" ? "A course with that name/slug already exists." : err.message);
    onCreated(data.id);
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${C.brandGreen}`, padding: 22, maxWidth: 520 }}>
      <label style={labelStyle}>New course title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sake Fundamentals" style={inputStyle} />
      {error && <p style={{ fontSize: 13, color: C.hanko, margin: "10px 0 0" }}>{error}</p>}
      <p style={{ fontSize: 12, color: C.mist, margin: "10px 0 0", lineHeight: 1.5 }}>
        Created as a draft consumer video course — publish it from the editor when its modules are ready.
      </p>
      <button onClick={create} disabled={saving} style={{ ...btnPrimary, marginTop: 14, opacity: saving ? 0.5 : 1 }}>
        {saving ? "Creating…" : "Create course"}
      </button>
    </div>
  );
}

function CourseEditor({ course, onChanged }) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description ?? "");
  const [price, setPrice] = useState(course.price_cents != null ? String(course.price_cents / 100) : "");
  const [published, setPublished] = useState(course.is_published);
  const [promoGuid, setPromoGuid] = useState(course.promo_video_ref ?? "");
  const [promoNotice, setPromoNotice] = useState("");
  const [checkingPromo, setCheckingPromo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [modules, setModules] = useState(null);

  async function loadModules() {
    const { data } = await supabase
      .from("modules")
      .select("*")
      .eq("course_id", course.id)
      .order("sort_order");
    setModules(data ?? []);
  }
  useEffect(() => { loadModules(); }, [course.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveCourse() {
    if (!title.trim()) return setError("Title is required.");
    let priceCents = null;
    if (course.track === "consumer" && String(price).trim() !== "") {
      const p = Number(price);
      if (!Number.isFinite(p) || p < 0.5) return setError("Price must be at least $0.50 (or blank while not for sale).");
      priceCents = Math.round(p * 100);
    }
    setSaving(true);
    setError("");
    setSaved(false);
    const { error: err } = await supabase
      .from("courses")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        is_published: published,
        price_cents: priceCents,
        promo_video_ref: promoGuid.trim() || null,
      })
      .eq("id", course.id);
    setSaving(false);
    if (err) return setError(err.message);
    setSaved(true);
    onChanged();
  }

  async function move(mod, dir) {
    const idx = modules.findIndex((m) => m.id === mod.id);
    const other = modules[idx + dir];
    if (!other) return;
    await supabase.from("modules").update({ sort_order: other.sort_order }).eq("id", mod.id);
    await supabase.from("modules").update({ sort_order: mod.sort_order }).eq("id", other.id);
    loadModules();
  }

  async function remove(mod) {
    if (!window.confirm(`Delete module "${mod.title}"? The video stays in Bunny.`)) return;
    const { error: err } = await supabase.from("modules").delete().eq("id", mod.id);
    if (err) {
      window.alert(
        err.code === "23503"
          ? "This module has student progress recorded, so it can't be deleted. (We can add an archive option if you need it.)"
          : err.message,
      );
      return;
    }
    loadModules();
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${C.brandGreen}`, padding: 22 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 2fr) minmax(110px, 1fr) auto", gap: 12, alignItems: "end", maxWidth: 720 }}>
        <div>
          <label style={labelStyle}>Course title</label>
          <input value={title} onChange={(e) => { setTitle(e.target.value); setSaved(false); }} style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Price (USD)</label>
          <input
            type="number" min="0.5" step="0.01"
            value={price}
            placeholder="not for sale"
            disabled={course.track !== "consumer"}
            onChange={(e) => { setPrice(e.target.value); setSaved(false); }}
            style={{ ...inputStyle, opacity: course.track !== "consumer" ? 0.5 : 1 }}
          />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13.5, cursor: "pointer", paddingBottom: 9 }}>
          <input
            type="checkbox"
            checked={published}
            onChange={(e) => { setPublished(e.target.checked); setSaved(false); }}
            style={{ accentColor: C.brandGreen, width: 15, height: 15 }}
          />
          Published
        </label>
      </div>
      {course.track === "consumer" && (
        <div style={{ marginTop: 14, maxWidth: 720 }}>
          <label style={labelStyle}>Sales page description (shown on /enroll/{course.slug})</label>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); setSaved(false); }}
            rows={4}
            placeholder="Describe the course the way you'd pitch it to a student — this is the main paragraph on the public sales page."
            style={{ ...inputStyle, resize: "vertical" }}
          />
          <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) auto", gap: 10, alignItems: "end", marginTop: 12 }}>
            <div>
              <label style={labelStyle}>Sales video GUID (public intro on the sales page)</label>
              <input
                value={promoGuid}
                onChange={(e) => { setPromoGuid(e.target.value); setPromoNotice(""); setSaved(false); }}
                placeholder="Bunny GUID — blank for no video"
                style={{ ...inputStyle, fontFamily: fontMono, fontSize: 13 }}
              />
            </div>
            <button
              onClick={async () => {
                setCheckingPromo(true);
                setPromoNotice("");
                try {
                  const info = await invokeFn("bunny-video-info", { video_ref: promoGuid.trim() });
                  setPromoNotice(info.ready ? "✓ Found it — ready to stream." : "Found it, but Bunny is still processing it.");
                } catch (err) {
                  setPromoNotice(err.message || "Lookup failed.");
                }
                setCheckingPromo(false);
              }}
              disabled={checkingPromo || !promoGuid.trim()}
              style={{ ...btnGhost, padding: "10px 16px", opacity: checkingPromo || !promoGuid.trim() ? 0.5 : 1 }}
            >
              {checkingPromo ? "Checking…" : "Look up"}
            </button>
          </div>
          {promoNotice && <p style={{ fontSize: 13, color: promoNotice.startsWith("✓") ? C.green : C.hanko, margin: "8px 0 0" }}>{promoNotice}</p>}
          <p style={{ fontSize: 12, color: C.mist, margin: "8px 0 0", lineHeight: 1.5 }}>
            This video is PUBLIC — anyone visiting the sales page can watch it.
            Keep course content out of it; it's your pitch.
          </p>
        </div>
      )}
      <p style={{ fontFamily: fontMono, fontSize: 11.5, color: C.mist, margin: "8px 0 0" }}>
        /course/{course.slug} · {course.track} · {course.delivery}
        {course.track === "consumer" && " · sales page: /enroll/" + course.slug}
      </p>
      {error && <p style={{ fontSize: 13, color: C.hanko, margin: "10px 0 0" }}>{error}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "14px 0 26px" }}>
        <button onClick={saveCourse} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
          {saving ? "Saving…" : "Save course"}
        </button>
        {saved && <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>✓ Saved</span>}
      </div>

      <h2 style={{ fontFamily: fontDisplay, fontSize: 19, fontWeight: 700, margin: "0 0 12px" }}>Modules</h2>
      {modules === null ? (
        <p style={{ color: C.mist, fontFamily: fontMono, fontSize: 13 }}>Loading…</p>
      ) : (
        <div style={{ display: "grid", gap: 8, marginBottom: 22 }}>
          {modules.map((mod, i) => (
            <ModuleRow
              key={mod.id}
              mod={mod}
              index={i}
              total={modules.length}
              onMove={move}
              onRemove={remove}
              onSaved={loadModules}
            />
          ))}
          {modules.length === 0 && (
            <p style={{ fontSize: 13.5, color: C.mist, margin: 0 }}>No modules yet — add the first one below.</p>
          )}
        </div>
      )}

      <AddModule
        courseId={course.id}
        nextSort={(modules?.[modules.length - 1]?.sort_order ?? 0) + 1}
        onAdded={loadModules}
      />
    </div>
  );
}

function ModuleRow({ mod, index, total, onMove, onRemove, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(mod.title);
  const [description, setDescription] = useState(mod.description ?? "");
  const [file, setFile] = useState(null); // replacement/new handout
  const [dropResource, setDropResource] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!title.trim()) return setError("Title is required.");
    setSaving(true);
    setError("");
    try {
      const fields = { title: title.trim(), description: description.trim() || null };
      if (file) {
        const up = await uploadResource(mod.course_id, file);
        fields.resource_path = up.path;
        fields.resource_name = up.name;
      } else if (dropResource) {
        fields.resource_path = null;
        fields.resource_name = null;
      }
      const { error: err } = await supabase.from("modules").update(fields).eq("id", mod.id);
      if (err) throw new Error(err.message);
      if ((file || dropResource) && mod.resource_path) removeResourceQuietly(mod.resource_path);
      setEditing(false);
      setFile(null);
      setDropResource(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <div style={{ border: `1px solid ${C.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", flexWrap: "wrap" }}>
        <span style={{ fontFamily: fontMono, fontSize: 12, color: C.mist, minWidth: 18 }}>{index + 1}</span>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600, minWidth: 160 }}>
          {mod.title}
          {mod.resource_name && <span style={{ fontFamily: fontMono, fontSize: 11, color: C.gold, marginLeft: 8 }}>📄</span>}
        </span>
        <span style={{ fontFamily: fontMono, fontSize: 11.5, color: C.mist }}>
          {mod.video_ref ? `${mod.video_ref.slice(0, 8)}…` : "no video"}
          {mod.duration_sec != null && ` · ${Math.floor(mod.duration_sec / 60)}:${String(mod.duration_sec % 60).padStart(2, "0")}`}
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <button onClick={() => onMove(mod, -1)} disabled={index === 0} style={{ ...btnGhost, padding: "5px 10px", opacity: index === 0 ? 0.35 : 1 }}>↑</button>
          <button onClick={() => onMove(mod, 1)} disabled={index === total - 1} style={{ ...btnGhost, padding: "5px 10px", opacity: index === total - 1 ? 0.35 : 1 }}>↓</button>
          <button onClick={() => setEditing((v) => !v)} style={{ ...btnGhost, padding: "5px 10px" }}>{editing ? "Close" : "Edit"}</button>
          <button onClick={() => onRemove(mod)} style={{ ...btnGhost, padding: "5px 10px", color: C.hanko, borderColor: C.hanko }}>Delete</button>
        </span>
      </div>

      {editing && (
        <div style={{ borderTop: `1px solid ${C.line}`, padding: "14px 14px 16px", background: C.rice }}>
          <label style={labelStyle}>Module title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }} />
          <label style={labelStyle}>Description (shown under the player)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            placeholder="What this module covers…"
            style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
          />
          <label style={labelStyle}>Downloadable handout (PDF)</label>
          {mod.resource_name && !file && !dropResource ? (
            <p style={{ fontSize: 13.5, margin: "0 0 10px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span>📄 {mod.resource_name}</span>
              <button onClick={() => setDropResource(true)} style={{ ...btnGhost, padding: "4px 10px", fontSize: 12, color: C.hanko, borderColor: C.hanko }}>Remove</button>
            </p>
          ) : dropResource && !file ? (
            <p style={{ fontSize: 13, color: C.hanko, margin: "0 0 10px" }}>
              Handout will be removed on save.{" "}
              <button onClick={() => setDropResource(false)} style={{ ...btnGhost, padding: "3px 8px", fontSize: 12 }}>Keep it</button>
            </p>
          ) : null}
          <input
            type="file"
            accept=".pdf,application/pdf"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDropResource(false); }}
            style={{ fontSize: 13, marginBottom: 12, fontFamily: fontBody }}
          />
          {error && <p style={{ fontSize: 13, color: C.hanko, margin: "0 0 10px" }}>{error}</p>}
          <button onClick={save} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Save module"}
          </button>
        </div>
      )}
    </div>
  );
}

function AddModule({ courseId, nextSort, onAdded }) {
  const [guid, setGuid] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState(null);
  const [duration, setDuration] = useState("");
  const [looking, setLooking] = useState(false);
  const [looked, setLooked] = useState(false); // GUID validated against Bunny
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function lookUp() {
    setLooking(true);
    setError("");
    setNotice("");
    try {
      const info = await invokeFn("bunny-video-info", { video_ref: guid.trim() });
      if (info.title && !title.trim()) setTitle(info.title);
      if (info.duration_sec != null) setDuration(String(info.duration_sec));
      setLooked(true);
      setNotice(info.ready
        ? `Found it — ${info.duration_sec != null ? `${info.duration_sec}s, ` : ""}ready to stream.`
        : "Found it, but Bunny is still processing this video — it may not play yet.");
    } catch (err) {
      setLooked(false);
      setError(err.message || "Lookup failed.");
    }
    setLooking(false);
  }

  async function add() {
    const t = title.trim();
    const g = guid.trim();
    if (!g) return setError("Paste the video GUID from Bunny first.");
    if (!t) return setError("Module title is required.");
    const dur = duration === "" ? null : parseInt(duration, 10);
    if (dur !== null && (!Number.isInteger(dur) || dur < 1)) return setError("Duration must be seconds (or blank).");
    setSaving(true);
    setError("");
    try {
      let resource_path = null;
      let resource_name = null;
      if (file) {
        const up = await uploadResource(courseId, file);
        resource_path = up.path;
        resource_name = up.name;
      }
      const { error: err } = await supabase.from("modules").insert({
        course_id: courseId,
        sort_order: nextSort,
        title: t,
        description: description.trim() || null,
        video_provider: "bunny",
        video_ref: g,
        duration_sec: dur,
        resource_path,
        resource_name,
      });
      if (err) throw new Error(err.message);
      setGuid(""); setTitle(""); setDescription(""); setFile(null); setDuration(""); setLooked(false); setNotice("");
      onAdded();
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  return (
    <div style={{ border: `1px dashed ${C.line}`, padding: 18 }}>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.14em", color: C.mist, fontWeight: 600, margin: "0 0 12px" }}>
        Add module
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 2fr) auto", gap: 10, alignItems: "end", marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Bunny video GUID</label>
          <input
            value={guid}
            onChange={(e) => { setGuid(e.target.value); setLooked(false); setNotice(""); }}
            placeholder="8c2468b7-9db4-480a-…  (from the video's page in Bunny)"
            style={{ ...inputStyle, fontFamily: fontMono, fontSize: 13 }}
          />
        </div>
        <button onClick={lookUp} disabled={looking || !guid.trim()} style={{ ...btnGhost, padding: "10px 16px", opacity: looking || !guid.trim() ? 0.5 : 1 }}>
          {looking ? "Checking…" : "Look up"}
        </button>
      </div>
      {notice && <p style={{ fontSize: 13, color: C.green, margin: "0 0 12px" }}>{notice}</p>}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(200px, 2fr) minmax(110px, 1fr)", gap: 10, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Module title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. What is sake?" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Duration (sec)</label>
          <input type="number" min="1" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="auto" style={inputStyle} />
        </div>
      </div>
      <label style={labelStyle}>Description (shown under the player)</label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="What this module covers…"
        style={{ ...inputStyle, resize: "vertical", marginBottom: 12 }}
      />
      <label style={labelStyle}>Downloadable handout (PDF, optional)</label>
      <input
        type="file"
        accept=".pdf,application/pdf"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ fontSize: 13, marginBottom: 12, fontFamily: fontBody, display: "block" }}
      />
      {error && <p style={{ fontSize: 13, color: C.hanko, margin: "0 0 12px" }}>{error}</p>}
      <button onClick={add} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.5 : 1 }}>
        {saving ? "Adding…" : "Add module"}
      </button>
      {!looked && guid.trim() !== "" && (
        <p style={{ fontSize: 12, color: C.mist, margin: "10px 0 0" }}>
          Tip: "Look up" validates the GUID and fills the duration automatically.
        </p>
      )}
    </div>
  );
}
