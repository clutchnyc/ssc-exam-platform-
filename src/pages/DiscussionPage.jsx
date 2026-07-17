import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { invokeFn, supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

// Course discussion board — /course/:slug/discussion(?module=<id>).
// Enrolled students + admins (RLS enforced). Top-level posts with one
// level of replies; posts can be tagged to a module, and ?module=
// pre-filters to that module's thread. All writes go through the
// create-post Edge Function (which also emails the admin).

export default function DiscussionPage() {
  const { slug } = useParams();
  const [params, setParams] = useSearchParams();
  const moduleFilter = params.get("module"); // module id | null = all
  const { session, profile, profileLoading } = useAuth();
  const isAdmin = profile?.role === "admin";

  const [course, setCourse] = useState(undefined);
  const [modules, setModules] = useState([]);
  const [posts, setPosts] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    supabase
      .from("courses")
      .select("id, slug, title")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => setCourse(data ?? null));
  }, [slug, session]);

  async function loadPosts(courseId) {
    const { data } = await supabase
      .from("discussion_posts")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: true });
    setPosts(data ?? []);
  }

  useEffect(() => {
    if (!course) return;
    supabase
      .from("modules")
      .select("id, title, sort_order")
      .eq("course_id", course.id)
      .order("sort_order")
      .then(({ data }) => setModules(data ?? []));
    loadPosts(course.id);
  }, [course]); // eslint-disable-line react-hooks/exhaustive-deps

  if (session === undefined || profileLoading) return <Loading />;
  if (!session) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        <Link to="/login" style={{ color: C.green }}>Sign in</Link> to join the discussion.
      </p>
    );
  }
  if (course === undefined || posts === null) return <Loading />;
  if (course === null) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        No course here. <Link to="/" style={{ color: C.green }}>Back to portal</Link>
      </p>
    );
  }

  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const filterModule = moduleFilter ? moduleById.get(moduleFilter) : null;
  const topLevel = posts.filter((p) => !p.parent_id &&
    (!moduleFilter || p.module_id === moduleFilter));
  const repliesByParent = new Map();
  for (const p of posts) {
    if (!p.parent_id) continue;
    if (!repliesByParent.has(p.parent_id)) repliesByParent.set(p.parent_id, []);
    repliesByParent.get(p.parent_id).push(p);
  }

  async function removePost(post) {
    if (!window.confirm("Delete this post (and its replies)?")) return;
    const { error: err } = await supabase.from("discussion_posts").delete().eq("id", post.id);
    if (err) window.alert(err.message);
    else loadPosts(course.id);
  }

  const chip = (label, active, onClick) => (
    <button
      key={label}
      onClick={onClick}
      style={{
        background: active ? C.brandGreen : "transparent",
        color: active ? "#fff" : C.body,
        border: `1px solid ${active ? C.brandGreen : C.line}`,
        borderRadius: 0, padding: "7px 13px", fontSize: 12.5, fontWeight: 600,
        cursor: "pointer", fontFamily: fontBody,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brandGreen, fontWeight: 600, margin: "0 0 8px" }}>
        Discussion
      </p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>{course.title}</h1>
      <p style={{ fontSize: 13.5, color: C.mist, margin: "0 0 18px" }}>
        Questions and conversation for students of this course.{" "}
        <Link to={`/course/${course.slug}`} style={{ color: C.green }}>Back to the course</Link>
      </p>

      {modules.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
          {chip("All posts", !moduleFilter, () => setParams({}, { replace: true }))}
          {modules.map((m) =>
            chip(m.title, moduleFilter === m.id, () => setParams({ module: m.id }, { replace: true })),
          )}
        </div>
      )}

      <Composer
        courseId={course.id}
        moduleId={moduleFilter}
        placeholder={filterModule
          ? `Ask a question about “${filterModule.title}”…`
          : "Start a new discussion…"}
        onPosted={() => loadPosts(course.id)}
        onError={setError}
      />
      {error && <p style={{ fontSize: 13, color: C.hanko, margin: "10px 0 0" }}>{error}</p>}

      <div style={{ display: "grid", gap: 12, marginTop: 26 }}>
        {topLevel.length === 0 && (
          <p style={{ fontSize: 14, color: C.mist, textAlign: "center", padding: "30px 0" }}>
            {filterModule ? "No questions about this module yet — ask the first one!" : "No posts yet — start the conversation!"}
          </p>
        )}
        {[...topLevel].reverse().map((post) => (
          <PostCard
            key={post.id}
            post={post}
            replies={repliesByParent.get(post.id) ?? []}
            moduleById={moduleById}
            isAdmin={isAdmin}
            courseId={course.id}
            onDelete={removePost}
            onPosted={() => loadPosts(course.id)}
          />
        ))}
      </div>
    </div>
  );
}

function Composer({ courseId, moduleId, parentId, placeholder, compact, onPosted, onError }) {
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  async function post() {
    if (!body.trim()) return;
    setPosting(true);
    onError?.("");
    try {
      await invokeFn("create-post", {
        course_id: courseId,
        module_id: moduleId || null,
        parent_id: parentId || null,
        body: body.trim(),
      });
      setBody("");
      onPosted();
    } catch (err) {
      onError?.(err.message || "Could not post — try again.");
    }
    setPosting(false);
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 0, fontFamily: fontBody, background: C.paper, resize: "vertical" }}
      />
      <div>
        <button
          onClick={post}
          disabled={posting || !body.trim()}
          style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: compact ? "8px 18px" : "10px 24px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, opacity: posting || !body.trim() ? 0.5 : 1 }}
        >
          {posting ? "Posting…" : parentId ? "Reply" : "Post"}
        </button>
      </div>
    </div>
  );
}

function PostCard({ post, replies, moduleById, isAdmin, courseId, onDelete, onPosted }) {
  const [replying, setReplying] = useState(false);
  const [error, setError] = useState("");
  const mod = post.module_id ? moduleById.get(post.module_id) : null;

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: "16px 18px" }}>
      <PostBody post={post} tag={mod?.title} isAdmin={isAdmin} onDelete={onDelete} />
      <div style={{ marginTop: 10, paddingLeft: 16, borderLeft: `2px solid ${C.line}`, display: "grid", gap: 10 }}>
        {replies.map((r) => (
          <PostBody key={r.id} post={r} isAdmin={isAdmin} onDelete={onDelete} />
        ))}
        {replying ? (
          <Composer
            courseId={courseId}
            moduleId={post.module_id}
            parentId={post.id}
            placeholder="Write a reply…"
            compact
            onPosted={() => { setReplying(false); onPosted(); }}
            onError={setError}
          />
        ) : (
          <button
            onClick={() => setReplying(true)}
            style={{ justifySelf: "start", background: "transparent", border: "none", padding: 0, fontSize: 12.5, fontWeight: 600, color: C.green, cursor: "pointer", fontFamily: fontBody }}
          >
            Reply
          </button>
        )}
        {error && <p style={{ fontSize: 13, color: C.hanko, margin: 0 }}>{error}</p>}
      </div>
    </div>
  );
}

function PostBody({ post, tag, isAdmin, onDelete }) {
  const when = new Date(post.created_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return (
    <div>
      <p style={{ margin: "0 0 4px", display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>{post.author_name}</span>
        <span style={{ fontFamily: fontMono, fontSize: 11, color: C.mist }}>{when}</span>
        {tag && (
          <span style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, color: C.brandGreen, border: `1px solid ${C.brandGreen}`, padding: "1px 7px" }}>
            {tag}
          </span>
        )}
        {isAdmin && (
          <button
            onClick={() => onDelete(post)}
            style={{ background: "transparent", border: "none", padding: 0, fontSize: 11.5, color: C.hanko, cursor: "pointer", fontFamily: fontBody, marginLeft: "auto" }}
          >
            Delete
          </button>
        )}
      </p>
      <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{post.body}</p>
    </div>
  );
}

function Loading() {
  return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Loading…</p>;
}
