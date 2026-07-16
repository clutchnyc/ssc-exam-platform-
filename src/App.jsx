import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import { AuthProvider, useAuth } from "./AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "./theme";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ExamPage from "./pages/ExamPage";

export default function App() {
  if (!isConfigured) return <SetupNotice />;
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}

function Shell() {
  return (
    <div style={{ minHeight: "100vh", background: C.rice, fontFamily: fontBody, color: C.ink }}>
      <Header />
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/exam/:slug" element={<ExamPage />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </main>
    </div>
  );
}

function Header() {
  const { session, profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <header
      style={{
        background: C.indigoDeep, color: C.rice, padding: "14px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 8,
      }}
    >
      <Link to="/" style={{ display: "flex", alignItems: "baseline", gap: 12, textDecoration: "none", color: C.rice }}>
        <span style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>
          Sake Studies Center
        </span>
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: C.mist }}>
          Exam Portal
        </span>
      </Link>
      <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {session ? (
          <>
            {profile && (
              <span style={{ fontFamily: fontMono, fontSize: 12, color: C.mist }}>{profile.full_name}</span>
            )}
            <button
              onClick={async () => { await signOut(); navigate("/"); }}
              style={headerBtn}
            >
              Sign out
            </button>
          </>
        ) : (
          <Link to="/login" style={{ ...headerBtn, textDecoration: "none", display: "inline-block" }}>
            Sign in
          </Link>
        )}
      </nav>
    </header>
  );
}

const headerBtn = {
  background: "transparent", color: C.rice, border: `1px solid ${C.rice}`,
  borderRadius: 3, padding: "6px 16px", fontSize: 13, fontWeight: 600,
  cursor: "pointer", fontFamily: fontBody,
};

function SetupNotice() {
  return (
    <div style={{ minHeight: "100vh", background: C.rice, fontFamily: fontBody, color: C.ink, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${C.hanko}`, borderRadius: 4, padding: 32, maxWidth: 460 }}>
        <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, marginTop: 0 }}>Almost there</h1>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: C.body }}>
          Supabase credentials are missing. Copy <code>.env.example</code> to{" "}
          <code>.env</code>, fill in <code>VITE_SUPABASE_URL</code> and{" "}
          <code>VITE_SUPABASE_ANON_KEY</code> from your Supabase dashboard
          (Settings → API), then restart the dev server.
        </p>
      </div>
    </div>
  );
}
