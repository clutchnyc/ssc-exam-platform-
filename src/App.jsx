import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { isConfigured } from "./lib/supabase";
import { siteMode } from "./lib/host";
import { AuthProvider, useAuth } from "./AuthContext";
import { C, fontBody, fontDisplay, fontMono, logoHorizontal } from "./theme";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import ExamPage from "./pages/ExamPage";
import CoursePage from "./pages/CoursePage";
import EnrollPage from "./pages/EnrollPage";
import DiscussionPage from "./pages/DiscussionPage";
import CertificatePage from "./pages/CertificatePage";
import VerifyPage from "./pages/VerifyPage";
import AdminPage from "./pages/AdminPage";
import AdminQuestionsPage from "./pages/AdminQuestionsPage";
import AdminExamsPage from "./pages/AdminExamsPage";
import AdminClassesPage from "./pages/AdminClassesPage";
import AdminCoursesPage from "./pages/AdminCoursesPage";
import JoinPage from "./pages/JoinPage";

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
          <Route path="/course/:slug" element={<CoursePage />} />
          <Route path="/course/:slug/discussion" element={<DiscussionPage />} />
          <Route path="/enroll/:slug" element={<EnrollPage />} />
          <Route path="/certificate/:code" element={<CertificatePage />} />
          <Route path="/verify" element={<VerifyPage />} />
          <Route path="/verify/:code" element={<VerifyPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/questions" element={<AdminQuestionsPage />} />
          <Route path="/admin/exams" element={<AdminExamsPage />} />
          <Route path="/admin/classes" element={<AdminClassesPage />} />
          <Route path="/admin/courses" element={<AdminCoursesPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
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
      className="no-print"
      style={{
        background: C.paper, color: C.ink, padding: "12px 24px",
        borderBottom: `1px solid ${C.line}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        flexWrap: "wrap", gap: 8,
      }}
    >
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 14, textDecoration: "none", color: C.ink }}>
        <img src={logoHorizontal} alt="Sake Studies Center at Brooklyn Kura" style={{ height: 72, width: "auto", display: "block" }} />
        <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: C.mist, borderLeft: `1px solid ${C.line}`, paddingLeft: 14 }}>
          {siteMode() === "courses" ? "Online Courses" : "Exam Portal"}
        </span>
      </Link>
      <nav style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {session ? (
          <>
            {profile?.role === "admin" && (
              <Link to="/admin" style={{ fontSize: 13, fontWeight: 600, color: C.green, textDecoration: "none" }}>
                Admin
              </Link>
            )}
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
  background: C.brandGreen, color: "#fff", border: `1px solid ${C.brandGreen}`,
  borderRadius: 0, padding: "7px 18px", fontSize: 13, fontWeight: 600,
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
