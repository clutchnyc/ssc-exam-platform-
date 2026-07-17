import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontCertLabel, fontCertName, fontMono, logoMark } from "../theme";

// Timothy's designed diploma (DIPLOMAS/blank diploma.pdf, rasterized at
// 2400px). Dynamic fields are overlaid at percentages of the sheet; font
// sizes use cqw so they track the sheet's rendered width on any screen.
import diplomaBg from "../assets/diploma-bg.png";

export default function CertificatePage() {
  const { code } = useParams();
  const { session } = useAuth();
  const [cert, setCert] = useState(undefined); // undefined = loading, null = not found
  const [nameMetric, setNameMetric] = useState(null); // rendered width per 1px of font size

  // Measure the name in IvyPresto so each template can size it to fill its
  // own name zone: shorter names render much larger, long names shrink.
  useEffect(() => {
    if (!cert) return;
    let cancelled = false;
    document.fonts.load("400 100px ivypresto-display").then(() => {
      if (cancelled) return;
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.font = "400 100px ivypresto-display, Georgia, serif";
      setNameMetric(ctx.measureText(cert.profiles.full_name).width / 100);
    });
    return () => { cancelled = true; };
  }, [cert]);

  // Professional zone: 63.5cqw wide, height-capped at 10.5cqw.
  const nameSize = nameMetric ? Math.min((63.5 * 0.94) / nameMetric, 10.5) : null;

  // Dev-only mock so the diploma layout can be previewed without a session:
  // /certificate/PREVIEW (never matches in production builds)
  const isPreview = import.meta.env.DEV && code === "PREVIEW";

  useEffect(() => {
    if (isPreview) {
      // ?name= / ?year= let us try lengths and years while tuning the layout
      const params = new URLSearchParams(window.location.search);
      const mockName = params.get("name");
      const mockYear = params.get("year");
      const mockType = params.get("type"); // "completion" previews the consumer template
      setCert({
        verify_code: "SSC-2026-QK7M3",
        cert_type: mockType === "completion" ? "completion" : "professional",
        issued_at: mockYear ? `${mockYear}-07-17T12:00:00Z` : new Date().toISOString(),
        attempts: {
          score_pct: 92,
          exams: {
            title: mockType === "completion" ? "Sake Fundamentals" : "Sake Server Certification",
            pass_pct: 80,
          },
        },
        profiles: { full_name: mockName || "Alexandra Yamamoto-Rodriguez" },
      });
      return;
    }
    if (!session) return;
    supabase
      .from("certificates")
      .select("verify_code, cert_type, issued_at, attempts:attempt_id(score_pct, exams:exam_id(title, pass_pct)), profiles:user_id(full_name)")
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
  }).toUpperCase();
  const name = cert.profiles.full_name;
  const year = String(new Date(cert.issued_at).getFullYear());

  if (cert.cert_type === "completion") {
    return (
      <div>
        <CompletionSheet cert={cert} name={name} nameMetric={nameMetric} />
        <PrintActions />
      </div>
    );
  }

  return (
    <div>
      <div className="cert-sheet" style={{ position: "relative", maxWidth: 980, margin: "0 auto", aspectRatio: "2400 / 1854", containerType: "inline-size" }}>
        <img
          src={diplomaBg}
          alt=""
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
        />
        {/* Date — Acumin caps, characters justified to fill the DATE band */}
        <div style={{ position: "absolute", left: "20%", top: "31.2%", width: "33%", height: "4.5%", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {issued.split("").map((ch, i) => (
            <span key={i} style={{ fontFamily: fontCertLabel, fontWeight: 500, fontSize: "1.8cqw", color: C.ink, whiteSpace: "pre" }}>
              {ch}
            </span>
          ))}
        </div>
        {/* Student name — IvyPresto Display, SSC green, measured to fill the zone */}
        <div style={{ position: "absolute", left: "27%", top: "38.5%", width: "63.5%", height: "20%", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: fontCertName, fontWeight: 400, fontSize: `${nameSize ?? 5}cqw`, lineHeight: 1.05, color: C.brandGreen, whiteSpace: "nowrap", visibility: nameSize ? "visible" : "hidden" }}>
            {name}
          </span>
        </div>
        {/* Ribbon year — covers the artwork's baked-in digits with the exact
            ribbon green (#41b56f, sampled) and renders the issue year */}
        <div style={{ position: "absolute", left: "11.55%", top: "9.4%", width: "3.2%", height: "4.4%", background: "#41b56f", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
          <span style={{ fontFamily: fontCertLabel, fontWeight: 700, fontSize: "1.05cqw", letterSpacing: "0.42em", color: "#3a3734", textIndent: "0.42em", marginBottom: "0.45cqw" }}>
            {year.slice(0, 2)}
          </span>
          <span style={{ fontFamily: fontCertLabel, fontWeight: 700, fontSize: "1.05cqw", letterSpacing: "0.42em", color: "#3a3734", textIndent: "0.42em" }}>
            {year.slice(2)}
          </span>
        </div>
        {/* Verify URL + code — bottom left, under the signature block */}
        <div style={{ position: "absolute", left: "8.3%", top: "85.2%", width: "50%", whiteSpace: "nowrap" }}>
          <div style={{ fontFamily: fontMono, fontWeight: 600, fontSize: "1.1cqw", letterSpacing: "0.04em", color: C.ink }}>
            Certificate no. {cert.verify_code}
          </div>
          <div style={{ fontFamily: fontMono, fontSize: "1cqw", letterSpacing: "0.02em", color: C.body, marginTop: "0.35cqw" }}>
            Verify at {window.location.host}/verify/{cert.verify_code}
          </div>
        </div>
      </div>
      <PrintActions />
    </div>
  );
}

function PrintActions() {
  return (
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
  );
}

// ————— Completion certificate (consumer track, spec §5) —————
// Same brand system as the professional diploma — logo mark, brand green,
// IvyPresto/Acumin — but warmer and lighter: rice paper ground, layered
// wave motif from the mark, no verification code, no formal seal.
function CompletionSheet({ cert, name, nameMetric }) {
  const issuedWarm = new Date(cert.issued_at).toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });
  const courseTitle = cert.attempts?.exams?.title ?? "Sake Fundamentals";
  // Name zone: 74cqw wide, capped lower than the pro diploma for warmth.
  const size = nameMetric ? Math.min((74 * 0.94) / nameMetric, 9) : null;

  return (
    <div
      className="cert-sheet"
      style={{
        position: "relative", maxWidth: 980, margin: "0 auto",
        aspectRatio: "2400 / 1854", containerType: "inline-size",
        background: "#faf7f2", border: `1px solid ${C.line}`, overflow: "hidden",
      }}
    >
      {/* inner hairline frame, tan */}
      <div style={{ position: "absolute", inset: "3.2%", border: `1px solid ${C.tan}`, pointerEvents: "none" }} />

      {/* layered waves along the bottom — the logo mark's motif, unfurled */}
      <svg
        viewBox="0 0 1200 260"
        preserveAspectRatio="none"
        style={{ position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", height: "21%", display: "block" }}
      >
        <path d="M0,150 C180,90 380,190 600,140 C820,90 1020,180 1200,120 L1200,260 L0,260 Z" fill={C.tan} opacity="0.45" />
        <path d="M0,190 C220,130 420,220 640,170 C860,120 1040,210 1200,160 L1200,260 L0,260 Z" fill={C.amber} opacity="0.4" />
        <path d="M0,215 C240,165 460,245 700,200 C920,160 1080,230 1200,195 L1200,260 L0,260 Z" fill={C.brandGreen} opacity="0.9" />
      </svg>

      {/* content column */}
      <div style={{ position: "absolute", inset: "6% 10% 22%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center" }}>
        <img src={logoMark} alt="" style={{ width: "8.5cqw", height: "8.5cqw", display: "block" }} />
        <p style={{ fontFamily: fontCertLabel, fontWeight: 700, fontSize: "1.55cqw", letterSpacing: "0.42em", textIndent: "0.42em", color: C.body, margin: "2.6cqw 0 0", textTransform: "uppercase" }}>
          Certificate of Completion
        </p>
        <p style={{ fontFamily: fontCertName, fontStyle: "italic", fontSize: "1.9cqw", color: C.mist, margin: "3.4cqw 0 0" }}>
          This certifies that
        </p>
        <div style={{ height: "11cqw", display: "flex", alignItems: "center", justifyContent: "center", width: "100%" }}>
          <span style={{ fontFamily: fontCertName, fontWeight: 400, fontSize: `${size ?? 5}cqw`, lineHeight: 1.05, color: C.brandGreen, whiteSpace: "nowrap", visibility: size ? "visible" : "hidden" }}>
            {name}
          </span>
        </div>
        <p style={{ fontFamily: fontCertName, fontStyle: "italic", fontSize: "1.9cqw", color: C.mist, margin: 0 }}>
          has completed the online course
        </p>
        <p style={{ fontFamily: fontCertName, fontWeight: 400, fontSize: "3.4cqw", color: C.ink, margin: "1.2cqw 0 0" }}>
          {courseTitle}
        </p>
        <p style={{ fontFamily: fontCertLabel, fontWeight: 500, fontSize: "1.25cqw", letterSpacing: "0.3em", textIndent: "0.3em", color: C.gold, margin: "2.8cqw 0 0", textTransform: "uppercase" }}>
          {issuedWarm}
        </p>
      </div>

      {/* footer, riding above the waves */}
      <p style={{ position: "absolute", left: 0, right: 0, bottom: "13.5%", textAlign: "center", fontFamily: fontCertLabel, fontWeight: 600, fontSize: "1.15cqw", letterSpacing: "0.18em", textIndent: "0.18em", color: C.body, margin: 0, textTransform: "uppercase" }}>
        Sake Studies Center at Brooklyn Kura · SakeStudiesCenter.com
      </p>
    </div>
  );
}
