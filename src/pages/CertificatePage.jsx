import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontJp, fontMono, logoHorizontal } from "../theme";

// The holder's printable certificate. RLS scopes certificates to the owner
// (or an admin), so someone else's code just renders "not found" here —
// third parties use the public /verify/:code page instead.
export default function CertificatePage() {
  const { code } = useParams();
  const { session } = useAuth();
  const [cert, setCert] = useState(undefined); // undefined = loading, null = not found

  useEffect(() => {
    if (!session) return;
    supabase
      .from("certificates")
      .select("verify_code, issued_at, attempts:attempt_id(score_pct, exams:exam_id(title, pass_pct)), profiles:user_id(full_name)")
      .ilike("verify_code", code)
      .maybeSingle()
      .then(({ data }) => setCert(data ?? null));
  }, [session, code]);

  if (session === undefined) return null;
  if (session === null) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        <Link to="/login" style={{ color: C.indigo }}>Sign in</Link> to view your certificate.
      </p>
    );
  }
  if (cert === undefined) {
    return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Loading…</p>;
  }
  if (cert === null) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        No certificate of yours matches this code.{" "}
        <Link to="/" style={{ color: C.indigo }}>Back to portal</Link>
      </p>
    );
  }

  const issued = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  return (
    <div>
      <div
        className="cert-sheet"
        style={{
          position: "relative", background: C.paper, border: `1px solid ${C.line}`,
          borderRadius: 4, padding: "8px", maxWidth: 680, margin: "0 auto",
        }}
      >
        <div style={{ border: `2px solid ${C.indigoDeep}`, borderRadius: 2, padding: "48px 44px 40px", textAlign: "center" }}>
          <img src={logoHorizontal} alt="Sake Studies Center at Brooklyn Kura" style={{ height: 64, width: "auto" }} />
          <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.32em", color: C.gold, fontWeight: 600, margin: "34px 0 26px" }}>
            Certificate of Achievement
          </p>
          <p style={{ fontSize: 14, color: C.body, margin: "0 0 6px" }}>This certifies that</p>
          <p style={{ fontFamily: fontDisplay, fontSize: 38, fontWeight: 700, color: C.indigoDeep, margin: "0 0 4px", lineHeight: 1.2 }}>
            {cert.profiles.full_name}
          </p>
          <div style={{ width: 220, height: 1, background: C.line, margin: "14px auto 18px" }} />
          <p style={{ fontSize: 14, color: C.body, margin: "0 0 6px" }}>has successfully passed the</p>
          <p style={{ fontFamily: fontDisplay, fontSize: 23, fontWeight: 700, color: C.ink, margin: "0 0 10px" }}>
            {cert.attempts.exams.title}
          </p>
          <p style={{ fontSize: 13.5, color: C.mist, margin: "0 0 36px" }}>
            with a score of {cert.attempts.score_pct}% · pass mark {cert.attempts.exams.pass_pct}%
          </p>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", textAlign: "left" }}>
            <div>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: C.mist, margin: "0 0 3px" }}>Issued</p>
              <p style={{ fontSize: 13.5, color: C.ink, margin: 0 }}>{issued}</p>
            </div>
            <div style={{ textAlign: "right" }}>
              <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.14em", color: C.mist, margin: "0 0 3px" }}>Verification code</p>
              <p style={{ fontFamily: fontMono, fontSize: 13.5, color: C.ink, margin: 0 }}>{cert.verify_code}</p>
              <p style={{ fontSize: 11, color: C.mist, margin: "3px 0 0" }}>
                Verify at {window.location.host}/verify/{cert.verify_code}
              </p>
            </div>
          </div>
          {/* Hanko stamp — prototype seal, kept pending an official SSC seal */}
          <div
            style={{
              position: "absolute", top: 118, right: 46, width: 84, height: 84,
              border: `3px solid ${C.hanko}`, borderRadius: "50%", display: "flex",
              alignItems: "center", justifyContent: "center", transform: "rotate(-7deg)",
              color: C.hanko, opacity: 0.9,
            }}
          >
            <span style={{ fontFamily: fontJp, fontWeight: 700, fontSize: 26 }}>合格</span>
          </div>
        </div>
      </div>
      <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
        <button
          onClick={() => window.print()}
          style={{ background: C.indigoDeep, color: "#fff", border: "none", borderRadius: 3, padding: "12px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
        >
          Print / save as PDF
        </button>
        <Link
          to="/"
          style={{ border: `1px solid ${C.line}`, color: C.ink, borderRadius: 3, padding: "12px 20px", fontSize: 14, textDecoration: "none", fontFamily: fontBody, background: "transparent" }}
        >
          Back to portal
        </Link>
      </div>
    </div>
  );
}
