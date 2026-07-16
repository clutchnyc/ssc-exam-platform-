import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { invokeFn, supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext";
import { C, fontBody, fontDisplay, fontMono } from "../theme";

// Setup screen → runner → results, per the prototype flow.
// All grading, randomization, and timing truth live in the Edge Functions.
export default function ExamPage() {
  const { slug } = useParams();
  const { session, user, profile, profileLoading } = useAuth();

  const [exam, setExam] = useState(undefined); // undefined = loading, null = not found
  const [attemptsUsed, setAttemptsUsed] = useState(null);
  const [phase, setPhase] = useState("setup"); // setup | run | result
  const [run, setRun] = useState(null); // start-attempt payload
  const [result, setResult] = useState(null); // submit-attempt payload
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("exams")
      .select("*")
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle()
      .then(({ data }) => setExam(data ?? null));
  }, [slug, user]);

  useEffect(() => {
    if (!user || !exam?.max_attempts) return;
    supabase
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("exam_id", exam.id)
      .eq("user_id", user.id)
      .then(({ count }) => setAttemptsUsed(count ?? 0));
  }, [user, exam, phase]);

  if (session === undefined || profileLoading) return <Center mono>Loading…</Center>;
  if (!session) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/" replace />;
  if (exam === undefined) return <Center mono>Loading…</Center>;
  if (exam === null) return <Center>Exam not found.</Center>;

  async function begin() {
    setStarting(true);
    setError("");
    try {
      const data = await invokeFn("start-attempt", { exam_id: exam.id });
      setRun(data);
      setPhase("run");
    } catch (err) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }

  if (phase === "run" && run) {
    return (
      <Runner
        exam={exam}
        run={run}
        onDone={(res) => {
          setResult(res);
          setPhase("result");
        }}
      />
    );
  }

  if (phase === "result" && result) {
    return <Result exam={exam} result={result} profile={profile} />;
  }

  return (
    <Setup
      exam={exam}
      profile={profile}
      attemptsUsed={attemptsUsed}
      error={error}
      starting={starting}
      onBegin={begin}
    />
  );
}

// ————— Setup —————

function Setup({ exam, profile, attemptsUsed, error, starting, onBegin }) {
  const navigate = useNavigate();
  const isCert = exam.mode === "certification";
  const minutes = exam.time_limit_seconds ? Math.round(exam.time_limit_seconds / 60) : null;
  const outOfAttempts = isCert && exam.max_attempts != null &&
    attemptsUsed != null && attemptsUsed >= exam.max_attempts;

  return (
    <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: 32, maxWidth: 460, margin: "40px auto" }}>
      <h2 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, marginTop: 0 }}>{exam.title}</h2>
      <p style={{ fontSize: 14, color: C.body, lineHeight: 1.55 }}>
        {isCert
          ? `You'll answer ${exam.question_count} randomized questions in ${minutes} minutes. Answers can't be changed once submitted, and results are recorded.`
          : "Take your time — you'll see the correct answer and an explanation after each question."}
      </p>
      <div style={{ fontSize: 13, color: C.mist, fontFamily: fontMono, margin: "16px 0" }}>
        <div>Candidate: <span style={{ color: C.ink }}>{profile.full_name}</span>{isCert ? " (appears on certificate)" : ""}</div>
        {isCert && exam.max_attempts != null && attemptsUsed != null && (
          <div style={{ marginTop: 4 }}>
            Attempts used: {attemptsUsed} of {exam.max_attempts}
          </div>
        )}
      </div>
      {error && <p style={{ fontSize: 13, color: C.hanko }}>{error}</p>}
      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button
          onClick={onBegin}
          disabled={starting || outOfAttempts}
          style={{ flex: 1, background: isCert ? C.hanko : C.indigo, opacity: starting || outOfAttempts ? 0.45 : 1, color: "#fff", border: "none", borderRadius: 3, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
        >
          {outOfAttempts
            ? "No attempts remaining"
            : starting
            ? "Starting…"
            : isCert
            ? `Start timer — ${minutes}:00`
            : "Begin"}
        </button>
        <button
          onClick={() => navigate("/")}
          style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 3, padding: "12px 18px", fontSize: 14, cursor: "pointer", fontFamily: fontBody, color: C.ink }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ————— Runner —————

function Runner({ exam, run, onDone }) {
  const isCert = exam.mode === "certification";
  const questions = run.questions;

  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({}); // question_id -> displayed index
  const [feedback, setFeedback] = useState({}); // question_id -> practice-answer payload
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Server-anchored countdown: remaining_seconds came from started_at on the
  // server, so a page reload can't add time.
  const endAtRef = useRef(
    run.remaining_seconds != null ? Date.now() + run.remaining_seconds * 1000 : null,
  );
  const [timeLeft, setTimeLeft] = useState(run.remaining_seconds);
  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;

  useEffect(() => {
    if (endAtRef.current == null) return;
    const t = setInterval(() => {
      const left = Math.max(0, Math.round((endAtRef.current - Date.now()) / 1000));
      setTimeLeft(left);
      if (left <= 0) {
        clearInterval(t);
        submit(); // time's up — auto-submit whatever is answered
      }
    }, 500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(i) {
    const q = questions[idx];
    if (isCert) {
      setAnswers((a) => ({ ...a, [q.id]: i }));
      return;
    }
    // practice: one shot per question, then instant server-side feedback
    if (feedback[q.id] || checking) return;
    setAnswers((a) => ({ ...a, [q.id]: i }));
    setChecking(true);
    setError("");
    try {
      const fb = await invokeFn("practice-answer", {
        attempt_id: run.attempt_id,
        question_id: q.id,
        answer: i,
      });
      setFeedback((f) => ({ ...f, [q.id]: fb }));
    } catch (err) {
      // let them re-pick if the check failed
      setAnswers((a) => {
        const next = { ...a };
        delete next[q.id];
        return next;
      });
      setError(err.message);
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const res = await invokeFn("submit-attempt", {
        attempt_id: run.attempt_id,
        answers: answersRef.current,
      });
      onDone(res);
    } catch (err) {
      submittedRef.current = false;
      setSubmitting(false);
      setError(err.message);
    }
  }

  function next() {
    if (idx + 1 < questions.length) setIdx(idx + 1);
    else submit();
  }

  const q = questions[idx];
  const chosen = answers[q.id];
  const fb = feedback[q.id];
  const mm = String(Math.floor((timeLeft ?? 0) / 60)).padStart(2, "0");
  const ss = String((timeLeft ?? 0) % 60).padStart(2, "0");

  return (
    <div>
      {run.resumed && (
        <p style={{ fontFamily: fontMono, fontSize: 12, color: C.gold, margin: "0 0 12px" }}>
          Resumed your in-progress attempt — the clock kept running.
        </p>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <span style={{ fontFamily: fontMono, fontSize: 12.5, color: C.mist }}>
          Question {idx + 1} of {questions.length}
        </span>
        {timeLeft != null && (
          <span style={{ fontFamily: fontMono, fontSize: 15, fontWeight: 500, color: timeLeft < 60 ? C.hanko : C.indigoDeep, background: C.paper, border: `1px solid ${timeLeft < 60 ? C.hanko : C.line}`, borderRadius: 3, padding: "5px 12px" }}>
            {mm}:{ss}
          </span>
        )}
      </div>
      <div style={{ height: 3, background: C.line, borderRadius: 2, marginBottom: 28 }}>
        <div style={{ height: "100%", width: `${(idx / questions.length) * 100}%`, background: isCert ? C.hanko : C.indigo, borderRadius: 2, transition: "width .3s" }} />
      </div>
      <h2 style={{ fontFamily: fontDisplay, fontSize: 23, fontWeight: 700, lineHeight: 1.4, marginBottom: 24 }}>{q.prompt}</h2>
      {q.image_url && (
        <img src={q.image_url} alt="" style={{ maxWidth: "100%", borderRadius: 4, marginBottom: 20, border: `1px solid ${C.line}` }} />
      )}
      <div style={{ display: "grid", gap: 10 }}>
        {q.options.map((opt, i) => {
          const isChosen = chosen === i;
          let border = C.line, bg = C.paper;
          if (fb) {
            if (i === fb.correct_index) { border = C.green; bg = C.greenBg; }
            else if (isChosen) { border = C.hanko; bg = C.redBg; }
          } else if (isChosen) { border = C.indigo; bg = "#EEF1F6"; }
          return (
            <button
              key={i}
              className="opt"
              disabled={checking || submitting}
              onClick={() => choose(i)}
              style={{ textAlign: "left", background: bg, border: `1.5px solid ${border}`, borderRadius: 4, padding: "14px 16px", fontSize: 15, fontFamily: fontBody, cursor: "pointer", color: C.ink, lineHeight: 1.4 }}
            >
              <span style={{ fontFamily: fontMono, fontSize: 12, color: C.mist, marginRight: 10 }}>
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
      {fb && (
        <div style={{ marginTop: 18, background: "#F1EFE7", borderLeft: `3px solid ${fb.correct ? C.green : C.hanko}`, padding: "14px 16px", fontSize: 14, lineHeight: 1.55, color: "#44413A" }}>
          <strong style={{ color: fb.correct ? C.green : C.hanko }}>
            {fb.correct ? "Correct. " : "Not quite. "}
          </strong>
          {fb.explanation}
        </div>
      )}
      {error && <p style={{ fontSize: 13, color: C.hanko, marginTop: 14 }}>{error}</p>}
      <div style={{ marginTop: 26, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={next}
          disabled={chosen === undefined || checking || submitting || (!isCert && !fb)}
          style={{ background: C.indigoDeep, color: "#fff", border: "none", borderRadius: 3, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: chosen === undefined || checking || submitting || (!isCert && !fb) ? 0.4 : 1, fontFamily: fontBody }}
        >
          {submitting ? "Submitting…" : idx + 1 === questions.length ? "Finish" : "Next question"}
        </button>
      </div>
    </div>
  );
}

// ————— Result —————

function Result({ exam, result, profile }) {
  const navigate = useNavigate();
  const isCert = exam.mode === "certification";

  return (
    <div style={{ textAlign: "center", paddingTop: 30 }}>
      <div style={{ position: "relative", display: "inline-block", padding: "10px 0 26px" }}>
        <p style={{ fontFamily: fontMono, fontSize: 13, color: C.mist, margin: 0 }}>
          {isCert ? "Certification Exam" : "Practice Quiz"}
          {result.flagged_late ? " · time expired" : ""}
        </p>
        <p style={{ fontFamily: fontDisplay, fontSize: 76, fontWeight: 700, margin: "6px 0 2px", color: C.indigoDeep }}>
          {result.score_pct}
          <span style={{ fontSize: 30 }}>%</span>
        </p>
        <p style={{ fontSize: 14, color: C.body, margin: 0 }}>
          {result.correct_count} of {result.total} correct
        </p>
        {isCert && (
          <div
            className="stamp"
            style={{ position: "absolute", top: -6, right: -110, width: 96, height: 96, border: `3.5px solid ${result.passed ? C.hanko : C.mist}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-8deg)", animation: "stamp .45s cubic-bezier(.2,.9,.3,1.2) both", color: result.passed ? C.hanko : C.mist }}
          >
            <span style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: result.passed ? 22 : 15, letterSpacing: "0.05em" }}>
              {result.passed ? "合格" : "再挑戦"}
            </span>
          </div>
        )}
      </div>
      {isCert && (
        <p style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, color: result.passed ? C.hanko : C.ink, margin: "0 0 8px" }}>
          {result.passed ? "Passed — congratulations." : "Below the pass mark this time."}
        </p>
      )}
      <p style={{ fontSize: 14, color: C.body, maxWidth: 420, margin: "0 auto 14px", lineHeight: 1.55 }}>
        {isCert
          ? result.passed
            ? `Your result has been recorded, ${profile.full_name}. Your certificate has been issued.`
            : result.flagged_late
            ? "This attempt ran past the time limit, so it can't count as a pass. Review with practice mode, then try again."
            : `A score of ${exam.pass_pct}% is required. Review with practice mode, then try again.`
          : "Nice work. Every question you missed showed its explanation along the way — repeat anytime."}
      </p>
      {result.certificate && (
        <p style={{ fontFamily: fontMono, fontSize: 13, color: C.gold, margin: "0 auto 30px" }}>
          Certificate verification code: <strong>{result.certificate.verify_code}</strong>
        </p>
      )}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 16 }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: C.indigo, color: "#fff", border: "none", borderRadius: 3, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
        >
          Back to portal
        </button>
      </div>
    </div>
  );
}

function Center({ children, mono }) {
  return (
    <p style={{ textAlign: "center", color: C.mist, fontFamily: mono ? fontMono : fontBody, fontSize: 13, paddingTop: 60 }}>
      {children}
    </p>
  );
}
