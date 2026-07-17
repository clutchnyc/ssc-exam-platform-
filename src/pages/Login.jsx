import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay } from "../theme";

export default function Login() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (session) navigate("/", { replace: true });
  }, [session, navigate]);

  async function sendLink(e) {
    e.preventDefault();
    setState("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: 32, maxWidth: 460, margin: "40px auto" }}>
      <h2 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, marginTop: 0 }}>Sign in</h2>

      {state === "sent" ? (
        <div>
          <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6 }}>
            Check your email — we sent a sign-in link to <strong>{email}</strong>.
            Click it and you'll land back here, signed in. You can close this tab.
          </p>
          <button onClick={() => setState("idle")} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 0, padding: "10px 18px", fontSize: 13, cursor: "pointer", fontFamily: fontBody, color: C.ink }}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink}>
          <p style={{ fontSize: 14, color: C.body, lineHeight: 1.6 }}>
            No passwords here. Enter your email and we'll send you a magic
            sign-in link.
          </p>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.mist, margin: "18px 0 6px" }}>
            Email address
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: `1px solid ${C.line}`, borderRadius: 3, fontFamily: fontBody, background: C.rice }}
          />
          {state === "error" && (
            <p style={{ fontSize: 13, color: C.hanko, marginTop: 10 }}>{errorMsg}</p>
          )}
          <button
            type="submit"
            disabled={state === "sending" || !email.trim()}
            style={{ width: "100%", marginTop: 22, background: C.brandGreen, opacity: state === "sending" || !email.trim() ? 0.45 : 1, color: "#fff", border: "none", borderRadius: 0, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
          >
            {state === "sending" ? "Sending…" : "Send magic link"}
          </button>
        </form>
      )}
    </div>
  );
}
