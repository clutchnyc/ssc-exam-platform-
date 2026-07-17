import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontMono } from "../theme";

// Timothy's designed diploma (DIPLOMAS/blank diploma.pdf, rasterized at
// 2400px). Dynamic fields are overlaid at percentages of the sheet; font
// sizes use cqw so they track the sheet's rendered width on any screen.
import diplomaBg from "../assets/diploma-bg.png";

export default function CertificatePage() {
  const { code } = useParams();
  const { session } = useAuth();
  const [cert, setCert] = useState(undefined); // undefined = loading, null = not found

  // Dev-only mock so the diploma layout can be previewed without a session:
  // /certificate/PREVIEW (never matches in production builds)
  const isPreview = import.meta.env.DEV && code === "PREVIEW";

  useEffect(() => {
    if (isPreview) {
      setCert({
        verify_code: "SSC-2026-QK7M3",
        issued_at: new Date().toISOString(),
        attempts: { score_pct: 92, exams: { title: "Sake Server Certification", pass_pct: 80 } },
        profiles: { full_name: "Alexandra Yamamoto-Rodriguez" },
      });
      return;
    }
    if (!session) return;
    supabase
      .from("certificates")
      .select("verify_code, issued_at, attempts:attempt_id(score_pct, exams:exam_id(title, pass_pct)), profiles:user_id(full_name)")
      .ilike("verify_code", code)
      .maybeSingle()
      .then(({ data }) => setCert(data ?? null));
  }, [session, code, isPreview]);

  if (!isPreview) {
    if (session === undefined) return null;
    if (session === null) {
      return (
        <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
          <Link to="/login" style={{ color: C.green }}>Sign in</Link> to view your certificate.
        </p>
      );
    }
  }
  if (cert === undefined) {
    return <p style={{ textAlign: "center", color: C.mist, fontFamily: fontMono, fontSize: 13, paddingTop: 60 }}>Loading…</p>;
  }
  if (cert === null) {
    return (
      <p style={{ textAlign: "center", color: C.mist, fontSize: 14, paddingTop: 60 }}>
        No certificate of yours matches this code.{" "}
        <Link to="/" style={{ color: C.green }}>Back to portal</Link>
      </p>
    );
  }

  const issued = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const name = cert.profiles.full_name;
  // Long names shrink so they stay inside the awarded-to zone
  const nameSize = name.length > 26 ? 4.2 : name.length > 18 ? 5 : 5.8; // cqw

  return (
    <div>
      <div className="cert-sheet" style={{ position: "relative", maxWidth: 980, margin: "0 auto", aspectRatio: "2400 / 1854", containerType: "inline-size" }}>
        <img
          src={diplomaBg}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
        />
        {/* Date — sits in the DATE band, right of the label */}
        <div style={{ position: "absolute", left: "19.5%", top: "31.2%", width: "37%", height: "4.5%", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: fontBody, fontWeight: 600, fontSize: "1.9cqw", letterSpacing: "0.06em", color: C.ink }}>
            {issued}
          </span>
        </div>
        {/* Student name — the awarded-to zone, SSC green */}
        <div style={{ position: "absolute", left: "27%", top: "38.5%", width: "63.5%", height: "20%", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
          <span style={{ fontFamily: fontBody, fontWeight: 700, fontSize: `${nameSize}cqw`, lineHeight: 1.1, color: C.brandGreen }}>
            {name}
          </span>
        </div>
        {/* Verify URL + code — bottom left, under the signature block */}
        <div style={{ position: "absolute", left: "8.3%", top: "85.2%", width: "50%", whiteSpace: "nowrap" }}>
          <div style={{ fontFamily: fontMono, fontWeight: 600, fontSize: "1.5cqw", letterSpacing: "0.04em", color: C.ink }}>
            Certificate no. {cert.verify_code}
          </div>
          <div style={{ fontFamily: fontMono, fontSize: "1.35cqw", letterSpacing: "0.02em", color: C.body, marginTop: "0.4cqw" }}>
            Verify at {window.location.host}/verify/{cert.verify_code}
          </div>
        </div>
      </div>
      <div className="no-print" style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 24 }}>
        <button
          onClick={() => window.print()}
          style={{ background: C.brandGreen, color: "#fff", border: "none", borderRadius: 0, padding: "12px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
        >
          Print / save as PDF
        </button>
        <Link
          to="/"
          style={{ border: `1px solid ${C.line}`, color: C.ink, borderRadius: 0, padding: "12px 20px", fontSize: 14, textDecoration: "none", fontFamily: fontBody, background: "transparent" }}
        >
          Back to portal
        </Link>
      </div>
    </div>
  );
}
