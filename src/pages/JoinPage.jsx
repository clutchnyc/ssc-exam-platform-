import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

// Class invite landing — /join/:code. Signed-out visitors go through
// login first (the pending code rides along in localStorage, and the
// Landing page routes them back here once a session + profile exist).
export const PENDING_JOIN_KEY = "ssc-pending-join-code";

export default function JoinPage() {
  const { code } = useParams();
  const { session, profile, profileLoading } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState({ status: "working" });
  const ranRef = useRef(false);

  useEffect(() => {
    if (session === undefined || profileLoading) return;

    if (!session) {
      // Remember the code, collect a session first
      localStorage.setItem(PENDING_JOIN_KEY, code);
      navigate("/login", { replace: true });
      return;
    }
    if (!profile) {
      // Profile (full name) is required before enrolling — Landing collects
      // it, then sends them back here via the pending code.
      localStorage.setItem(PENDING_JOIN_KEY, code);
      navigate("/", { replace: true });
      return;
    }

    if (ranRef.current) return; // join once per mount
    ranRef.current = true;
    localStorage.removeItem(PENDING_JOIN_KEY);
    supabase.rpc("join_class", { code }).then(({ data, error }) => {
      if (error) {
        const msg = error.message || "";
        if (msg.includes("expired")) setState({ status: "expired" });
        else if (msg.includes("invalid_code")) setState({ status: "invalid" });
        else setState({ status: "error" });
      } else {
        setState({ status: "joined", cls: data?.[0] ?? null });
      }
    });
  }, [session, profile, profileLoading, code, navigate]);

  const box = (children) => (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, padding: 32, maxWidth: 480, margin: "40px auto", textAlign: "center" }}>
      {children}
    </div>
  );

  if (state.status === "working") {
    return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Checking your class link…</p>;
  }

  if (state.status === "joined") {
    const until = state.cls?.expires_at
      ? new Date(state.cls.expires_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : null;
    return box(
      <>
        <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.brandGreen, fontWeight: 600, margin: "0 0 10px" }}>
          You're in
        </p>
        <h1 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, margin: "0 0 8px" }}>
          {state.cls?.class_name ?? "Welcome"}
        </h1>
        <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, margin: "0 0 22px" }}>
          Your exams are unlocked{until ? <> until <strong>{until}</strong></> : ""}. Good luck!
        </p>
        <Link
          to="/"
          style={{ display: "inline-block", background: C.brandGreen, color: "#fff", borderRadius: 0, padding: "12px 30px", fontSize: 14, fontWeight: 600, textDecoration: "none", fontFamily: fontBody }}
        >
          Go to your exams
        </Link>
      </>,
    );
  }

  if (state.status === "expired") {
    return box(
      <>
        <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>This class link has expired</h1>
        <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, margin: 0 }}>
          Exam access runs for two weeks after your class. If you need more
          time, contact the Sake Studies Center and we can extend it.
        </p>
      </>,
    );
  }

  if (state.status === "invalid") {
    return box(
      <>
        <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>This link isn't valid</h1>
        <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6, margin: 0 }}>
          Double-check the link from your class follow-up email, or contact
          the Sake Studies Center for a fresh one.
        </p>
      </>,
    );
  }

  return box(
    <p style={{ fontSize: 14, color: C.hanko, margin: 0 }}>
      Something went wrong — try the link again in a moment.
    </p>,
  );
}
