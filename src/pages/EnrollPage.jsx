import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { invokeFn, supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

// Public sales/enrollment page — /enroll/:slug. Browsable signed out
// (anon RLS exposes published courses); "Enroll" collects a session first
// (pending slug rides localStorage through login, like class joins), then
// hands off to Stripe Checkout. Back from Stripe with ?status=success we
// poll until the webhook lands the enrollment.
export const PENDING_ENROLL_KEY = "ssc-pending-enroll-slug";

export default function EnrollPage() {
  const { slug } = useParams();
  const [params] = useSearchParams();
  const status = params.get("status"); // success | cancelled | null
  const { session, profile, profileLoading } = useAuth();
  const navigate = useNavigate();

  const [course, setCourse] = useState(undefined);
  const [enrolled, setEnrolled] = useState(undefined); // undefined = checking (when signed in)
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const pollRef = useRef(null);

  useEffect(() => {
    supabase
      .from("courses")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle()
      .then(({ data }) => setCourse(data ?? null));
  }, [slug]);

  // Enrollment check (signed-in only) + post-payment polling
  useEffect(() => {
    if (!session || !course) {
      if (session === null) setEnrolled(false);
      return;
    }
    let cancelled = false;
    async function check() {
      const { data } = await supabase
        .from("course_enrollments")
        .select("id")
        .eq("course_id", course.id)
        .eq("status", "active")
        .maybeSingle();
      if (!cancelled) setEnrolled(!!data);
      return !!data;
    }
    check().then((isEnrolled) => {
      if (isEnrolled || status !== "success" || cancelled) return;
      // Payment just finished — poll until the webhook writes the enrollment.
      let tries = 0;
      pollRef.current = setInterval(async () => {
        tries += 1;
        const done = await check();
        if (done || tries > 20) clearInterval(pollRef.current);
      }, 2000);
    });
    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [session, course, status]);

  async function enroll() {
    if (!session) {
      localStorage.setItem(PENDING_ENROLL_KEY, slug);
      navigate("/login");
      return;
    }
    if (!profile) {
      localStorage.setItem(PENDING_ENROLL_KEY, slug);
      navigate("/");
      return;
    }
    setStarting(true);
    setError("");
    try {
      const res = await invokeFn("create-checkout-session", { course_id: course.id });
      if (res.already_enrolled) {
        setEnrolled(true);
      } else if (res.url) {
        window.location.assign(res.url);
        return; // leaving for Stripe
      }
    } catch (err) {
      setError(err.message || "Could not start checkout — try again.");
    }
    setStarting(false);
  }

  if (course === undefined || profileLoading) {
    return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Loading…</p>;
  }
  if (course === null || course.delivery !== "video") {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        No course here. <Link to="/" style={{ color: C.green }}>Back to portal</Link>
      </p>
    );
  }

  const price = course.price_cents != null
    ? `$${(course.price_cents / 100).toFixed(course.price_cents % 100 === 0 ? 0 : 2)}`
    : null;
  const finalizing = session && status === "success" && enrolled === false;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${C.brandGreen}`, padding: "36px 38px" }}>
        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brandGreen, fontWeight: 600, margin: "0 0 10px" }}>
          Online video course
        </p>
        <h1 style={{ fontFamily: fontDisplay, fontSize: 32, fontWeight: 700, lineHeight: 1.2, margin: "0 0 14px" }}>{course.title}</h1>
        <p style={{ fontSize: 15, color: C.body, lineHeight: 1.65, margin: "0 0 8px", whiteSpace: "pre-wrap" }}>
          {course.description ||
            `Learn sake at your own pace with short video modules from the Sake
Studies Center at Brooklyn Kura. Watch anywhere, download the course
materials, and finish with a completion quiz and certificate.`}
        </p>
        <ul style={{ fontSize: 14.5, color: C.body, lineHeight: 1.9, margin: "0 0 22px", paddingLeft: 20 }}>
          <li>Streaming video lessons — watch and rewatch anytime</li>
          <li>Downloadable study materials</li>
          <li>Completion quiz (untimed, retake freely)</li>
          <li>Personalized certificate of completion</li>
        </ul>

        {enrolled ? (
          <div>
            <p style={{ fontSize: 14.5, color: C.green, fontWeight: 600, margin: "0 0 14px" }}>
              ✓ You're enrolled{status === "success" ? " — payment received. Welcome!" : "."}
            </p>
            <button
              onClick={() => navigate(`/course/${course.slug}`)}
              style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "13px 34px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
            >
              Go to your course
            </button>
          </div>
        ) : finalizing ? (
          <p style={{ fontFamily: fontMono, fontSize: 13, color: C.mist }}>
            Payment received — finalizing your enrollment… this takes a few seconds.
          </p>
        ) : (
          <div>
            {status === "cancelled" && (
              <p style={{ fontSize: 13.5, color: C.mist, margin: "0 0 12px" }}>
                Checkout cancelled — no charge was made. Ready when you are.
              </p>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
              <button
                onClick={enroll}
                disabled={starting || !price}
                style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "13px 34px", fontSize: 14.5, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, opacity: starting || !price ? 0.5 : 1 }}
              >
                {starting ? "Starting checkout…" : price ? `Enroll now — ${price}` : "Enrollment opening soon"}
              </button>
              {!session && (
                <span style={{ fontSize: 13, color: C.mist }}>
                  You'll sign in with your email first, then pay securely via Stripe.
                </span>
              )}
            </div>
            {error && <p style={{ fontSize: 13, color: C.hanko, margin: "12px 0 0" }}>{error}</p>}
          </div>
        )}
      </div>
      <p style={{ fontFamily: fontMono, fontSize: 11.5, color: C.mist, textAlign: "center", marginTop: 14 }}>
        Questions? Contact us via SakeStudiesCenter.com
      </p>
    </div>
  );
}
