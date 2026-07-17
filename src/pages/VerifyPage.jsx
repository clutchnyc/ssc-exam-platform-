import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

// Public certificate verification — no sign-in required. Looks up a code
// via the anon-callable verify_certificate RPC (security definer).
export default function VerifyPage() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(code ?? "");
  const [state, setState] = useState({ status: code ? "loading" : "idle" });

  useEffect(() => {
    if (!code) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    supabase
      .rpc("verify_certificate", { code })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setState({ status: "error" });
        else if (data && data.length > 0) setState({ status: "valid", cert: data[0] });
        else setState({ status: "invalid" });
      });
    return () => { cancelled = true; };
  }, [code]);

  function submit(e) {
    e.preventDefault();
    const trimmed = input.trim();
    if (trimmed) navigate(`/verify/${encodeURIComponent(trimmed)}`);
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center", paddingTop: 20 }}>
      <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.gold, fontWeight: 600, marginBottom: 8 }}>
        Certificate verification
      </p>
      <h1 style={{ fontFamily: fontDisplay, fontSize: 30, fontWeight: 700, margin: "0 0 10px" }}>
        Check a certificate.
      </h1>
      <p style={{ color: C.body, lineHeight: 1.6, margin: "0 0 28px", fontSize: 14.5 }}>
        Enter the verification code printed on a Sake Studies Center
        certificate to confirm it's genuine.
      </p>

      <form onSubmit={submit} style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginBottom: 30 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="SSC-2026-XXXXX"
          autoComplete="off"
          spellCheck={false}
          style={{ flex: "1 1 220px", maxWidth: 280, boxSizing: "border-box", padding: "12px 14px", fontSize: 15, fontFamily: fontMono, textTransform: "uppercase", border: `1.5px solid ${C.line}`, borderRadius: 4, background: C.paper, color: C.ink, textAlign: "center" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || state.status === "loading"}
          style={{ background: C.indigo, color: "#fff", border: "none", borderRadius: 4, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody, opacity: !input.trim() || state.status === "loading" ? 0.45 : 1 }}
        >
          {state.status === "loading" ? "Checking…" : "Verify"}
        </button>
      </form>

      {state.status === "valid" && (
        <div style={{ background: C.greenBg, border: `1.5px solid ${C.green}`, borderRadius: 4, padding: "26px 24px", textAlign: "left" }}>
          <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.16em", color: C.green, fontWeight: 700, margin: "0 0 14px" }}>
            ✓ Valid certificate
          </p>
          <p style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: "0 0 2px", color: C.ink }}>
            {state.cert.full_name}
          </p>
          <p style={{ fontSize: 14.5, color: C.body, margin: "0 0 12px" }}>{state.cert.exam_title}</p>
          <p style={{ fontFamily: fontMono, fontSize: 12.5, color: C.mist, margin: 0 }}>
            {state.cert.verify_code} · issued{" "}
            {new Date(state.cert.issued_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
      )}

      {state.status === "invalid" && (
        <div style={{ background: C.redBg, border: `1.5px solid ${C.hanko}`, borderRadius: 4, padding: "22px 24px" }}>
          <p style={{ fontSize: 14.5, color: C.hanko, fontWeight: 600, margin: 0 }}>
            No certificate matches this code.
          </p>
          <p style={{ fontSize: 13.5, color: C.body, margin: "6px 0 0" }}>
            Double-check the code for typos — letters I, L, O and digits 0, 1
            are never used.
          </p>
        </div>
      )}

      {state.status === "error" && (
        <p style={{ fontSize: 14, color: C.hanko }}>
          Something went wrong checking that code — try again in a moment.
        </p>
      )}
    </div>
  );
}
