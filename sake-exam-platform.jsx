import { useState, useEffect, useRef } from "react";

// ————————————————————————————————————————————————
// Sake Studies Center — Exam Platform Prototype
// Practice quizzes + timed certification exams,
// randomized questions, attempt records, certificates.
// ————————————————————————————————————————————————

const BASE_QUESTIONS = [
  { id: "q1", prompt: "What is the primary ingredient used to make sake?", options: ["Barley", "Rice", "Wheat", "Sorghum"], answer: 1, explain: "Sake is brewed from polished rice, along with water, koji, and yeast." },
  { id: "q2", prompt: "What does 'seimaibuai' (精米歩合) refer to?", options: ["Fermentation temperature", "The rice polishing ratio", "Alcohol by volume", "Aging duration"], answer: 1, explain: "Seimaibuai is the percentage of the rice grain remaining after polishing — 60% means 40% has been milled away." },
  { id: "q3", prompt: "Junmai Daiginjo requires rice polished to at most what percentage remaining?", options: ["70%", "60%", "50%", "40%"], answer: 2, explain: "Daiginjo classifications require a seimaibuai of 50% or less." },
  { id: "q4", prompt: "What is the role of koji (麹) in sake brewing?", options: ["Adds carbonation", "Converts rice starch into fermentable sugar", "Filters the moromi", "Raises acidity for preservation"], answer: 1, explain: "Koji mold (Aspergillus oryzae) produces enzymes that break rice starch into sugars the yeast can ferment." },
  { id: "q5", prompt: "Which term describes sake that has NOT been pasteurized?", options: ["Genshu", "Nigori", "Namazake", "Koshu"], answer: 2, explain: "Namazake (生酒) is unpasteurized sake, prized for fresh, lively character — and it requires refrigeration." },
  { id: "q6", prompt: "'Genshu' (原酒) indicates a sake that is…", options: ["Undiluted with water", "Cloudy and unfiltered", "Aged over three years", "Brewed with wild yeast"], answer: 0, explain: "Genshu skips the customary dilution step, typically landing at 18–20% ABV." },
  { id: "q7", prompt: "The Nada brewing district, famous for its 'miyamizu' water, is located near which city?", options: ["Niigata", "Kyoto", "Kobe", "Hiroshima"], answer: 2, explain: "Nada, in Hyogo Prefecture near Kobe, is Japan's largest sake-producing region, known for hard miyamizu water." },
  { id: "q8", prompt: "Which rice variety is often called the 'king of sake rice'?", options: ["Koshihikari", "Yamada Nishiki", "Gohyakumangoku", "Omachi"], answer: 1, explain: "Yamada Nishiki, first grown in Hyogo, is the most celebrated shuzo-kotekimai (sake-specific rice)." },
  { id: "q9", prompt: "A 'nihonshu-do' (SMV) of +10 generally indicates a sake that is…", options: ["Very sweet", "Very dry", "Highly acidic", "Low in alcohol"], answer: 1, explain: "Sake Meter Value measures density; higher positive numbers indicate a drier sake." },
  { id: "q10", prompt: "What is 'moromi' (醪)?", options: ["The main fermentation mash", "Pressed sake lees", "A wooden brewing vat", "The rice-washing stage"], answer: 0, explain: "Moromi is the main mash where rice, koji, water, and yeast ferment together over several weeks." },
  { id: "q11", prompt: "Which serving vessel is the small ceramic flask traditionally used to serve warmed sake?", options: ["Ochoko", "Masu", "Tokkuri", "Guinomi"], answer: 2, explain: "The tokkuri is the flask; ochoko and guinomi are cups; a masu is the square cedar box." },
  { id: "q12", prompt: "Futsushu (普通酒) refers to…", options: ["Premium designation sake", "Ordinary table sake without a special designation", "Sparkling sake", "Sake brewed only in winter"], answer: 1, explain: "Futsushu is non-premium 'ordinary' sake, making up the majority of sake produced in Japan." },
];

const EXAM_LENGTH = 8;          // questions drawn per certification exam
const EXAM_MINUTES = 8;         // exam time limit
const PASS_PCT = 80;            // pass threshold

const C = {
  indigo: "#253C5B",
  indigoDeep: "#18293F",
  ink: "#1C1B18",
  rice: "#F6F4EE",
  paper: "#FDFCF9",
  hanko: "#B32A2A",
  gold: "#A98435",
  mist: "#8A94A6",
  line: "#DDD8CC",
};

const fontDisplay = "'Shippori Mincho', 'Georgia', serif";
const fontBody = "'IBM Plex Sans', -apple-system, 'Segoe UI', sans-serif";
const fontMono = "'IBM Plex Mono', 'SFMono-Regular', monospace";

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// shuffle a question's options, remapping the answer index
function shuffleOptions(q) {
  const order = shuffle(q.options.map((_, i) => i));
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    answer: order.indexOf(q.answer),
  };
}

async function loadStore(key, fallback) {
  try {
    const r = await window.storage.get(key);
    return r ? JSON.parse(r.value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveStore(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value));
  } catch (e) {
    console.error("storage save failed", e);
  }
}

export default function SakeExamPlatform() {
  const [view, setView] = useState("home"); // home | setup | run | result | certificate | admin
  const [mode, setMode] = useState("practice"); // practice | cert
  const [studentName, setStudentName] = useState("");
  const [questions, setQuestions] = useState([]); // active shuffled set
  const [bank, setBank] = useState(BASE_QUESTIONS);
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [revealed, setRevealed] = useState(false); // practice-mode feedback state
  const [timeLeft, setTimeLeft] = useState(EXAM_MINUTES * 60);
  const [attempts, setAttempts] = useState([]);
  const [lastResult, setLastResult] = useState(null);
  const [adminTab, setAdminTab] = useState("bank");
  const [newQ, setNewQ] = useState({ prompt: "", options: ["", "", "", ""], answer: 0, explain: "" });
  const timerRef = useRef(null);

  // load persisted attempts + custom questions once
  useEffect(() => {
    (async () => {
      const savedAttempts = await loadStore("ssc:attempts", []);
      const customQs = await loadStore("ssc:custom_questions", []);
      setAttempts(savedAttempts);
      if (customQs.length) setBank([...BASE_QUESTIONS, ...customQs]);
    })();
  }, []);

  // countdown for certification exams
  useEffect(() => {
    if (view === "run" && mode === "cert") {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) { clearInterval(timerRef.current); finishExam(true); return 0; }
          return t - 1;
        });
      }, 1000);
      return () => clearInterval(timerRef.current);
    }
  }, [view, mode]); // eslint-disable-line

  function startSetup(m) { setMode(m); setView("setup"); }

  function begin() {
    const pool = shuffle(bank).slice(0, mode === "cert" ? Math.min(EXAM_LENGTH, bank.length) : bank.length);
    setQuestions(pool.map(shuffleOptions));
    setIdx(0); setAnswers({}); setRevealed(false);
    setTimeLeft(EXAM_MINUTES * 60);
    setView("run");
  }

  function choose(optionIdx) {
    if (mode === "practice" && revealed) return;
    setAnswers((a) => ({ ...a, [idx]: optionIdx }));
    if (mode === "practice") setRevealed(true);
  }

  function next() {
    setRevealed(false);
    if (idx + 1 < questions.length) setIdx(idx + 1);
    else finishExam(false);
  }

  function finishExam(timedOut) {
    clearInterval(timerRef.current);
    setAnswers((finalAnswers) => {
      setQuestions((qs) => {
        const correct = qs.reduce((n, q, i) => n + (finalAnswers[i] === q.answer ? 1 : 0), 0);
        const pct = Math.round((correct / qs.length) * 100);
        const result = {
          name: studentName || "Guest",
          mode, correct, total: qs.length, pct,
          passed: mode === "cert" ? pct >= PASS_PCT : null,
          timedOut: !!timedOut,
          date: new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
          ts: Date.now(),
        };
        setLastResult(result);
        setAttempts((prev) => {
          const updated = [result, ...prev].slice(0, 50);
          saveStore("ssc:attempts", updated);
          return updated;
        });
        setView("result");
        return qs;
      });
      return finalAnswers;
    });
  }

  function addQuestion() {
    if (!newQ.prompt.trim() || newQ.options.some((o) => !o.trim())) return;
    const q = { ...newQ, id: "c" + Date.now() };
    const customs = bank.filter((b) => b.id.startsWith("c")).concat(q);
    setBank([...BASE_QUESTIONS, ...customs]);
    saveStore("ssc:custom_questions", customs);
    setNewQ({ prompt: "", options: ["", "", "", ""], answer: 0, explain: "" });
  }

  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");
  const q = questions[idx];

  return (
    <div style={{ minHeight: "100vh", background: C.rice, fontFamily: fontBody, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap');
        @keyframes stamp { 0% { transform: scale(2.4) rotate(-14deg); opacity: 0; } 60% { transform: scale(0.94) rotate(-8deg); opacity: 1; } 100% { transform: scale(1) rotate(-8deg); opacity: 1; } }
        @media (prefers-reduced-motion: reduce) { .stamp { animation: none !important; } }
        .opt:hover { border-color: ${C.indigo} !important; }
        button:focus-visible, .opt:focus-visible { outline: 2px solid ${C.indigo}; outline-offset: 2px; }
      `}</style>

      {/* ——— Top bar ——— */}
      <header style={{ background: C.indigoDeep, color: C.rice, padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, cursor: "pointer" }} onClick={() => setView("home")}>
          <span style={{ fontFamily: fontDisplay, fontSize: 20, fontWeight: 700, letterSpacing: "0.02em" }}>Sake Studies Center</span>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.18em", color: C.mist }}>Exam Portal</span>
        </div>
        <nav style={{ display: "flex", gap: 6 }}>
          {[["home", "Student"], ["admin", "Admin"]].map(([v, label]) => (
            <button key={v} onClick={() => setView(v)}
              style={{ background: (view === v || (v === "home" && view !== "admin")) ? C.rice : "transparent", color: (view === v || (v === "home" && view !== "admin")) ? C.indigoDeep : C.rice, border: `1px solid ${C.rice}`, borderRadius: 3, padding: "6px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}>
              {label}
            </button>
          ))}
        </nav>
      </header>

      <main style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* ——— HOME ——— */}
        {view === "home" && (
          <div>
            <p style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.2em", color: C.hanko, fontWeight: 600, marginBottom: 8 }}>Assessment</p>
            <h1 style={{ fontFamily: fontDisplay, fontSize: 34, fontWeight: 700, lineHeight: 1.2, margin: "0 0 10px" }}>Test your sake knowledge.</h1>
            <p style={{ color: "#55524A", maxWidth: 520, lineHeight: 1.6, marginBottom: 36 }}>
              Practice freely with instant feedback, or sit the timed certification exam. Your results are recorded and a certificate is issued on passing.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
              {[{
                m: "practice", title: "Practice Quiz", tag: "Untimed",
                desc: "Work through the full question bank at your own pace. Each answer is explained as you go.",
                meta: `${bank.length} questions · instant feedback`,
              }, {
                m: "cert", title: "Certification Exam", tag: "Timed",
                desc: `${EXAM_LENGTH} randomized questions in ${EXAM_MINUTES} minutes. Score ${PASS_PCT}% or higher to earn your certificate.`,
                meta: `${EXAM_MINUTES}:00 limit · ${PASS_PCT}% to pass · recorded`,
              }].map((card) => (
                <div key={card.m} style={{ background: C.paper, border: `1px solid ${C.line}`, borderTop: `3px solid ${card.m === "cert" ? C.hanko : C.indigo}`, borderRadius: 4, padding: 24, display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <h2 style={{ fontFamily: fontDisplay, fontSize: 21, fontWeight: 700, margin: 0 }}>{card.title}</h2>
                    <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, color: card.m === "cert" ? C.hanko : C.indigo, border: `1px solid currentColor`, padding: "3px 8px", borderRadius: 2 }}>{card.tag}</span>
                  </div>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: "#55524A", flex: 1 }}>{card.desc}</p>
                  <p style={{ fontFamily: fontMono, fontSize: 11.5, color: C.mist, margin: "10px 0 16px" }}>{card.meta}</p>
                  <button onClick={() => startSetup(card.m)}
                    style={{ background: card.m === "cert" ? C.hanko : C.indigo, color: "#fff", border: "none", borderRadius: 3, padding: "11px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}>
                    {card.m === "cert" ? "Begin exam" : "Start practicing"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ——— SETUP (name entry) ——— */}
        {view === "setup" && (
          <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: 32, maxWidth: 460, margin: "40px auto" }}>
            <h2 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, marginTop: 0 }}>{mode === "cert" ? "Certification Exam" : "Practice Quiz"}</h2>
            <p style={{ fontSize: 14, color: "#55524A", lineHeight: 1.55 }}>
              {mode === "cert"
                ? `You'll answer ${EXAM_LENGTH} randomized questions in ${EXAM_MINUTES} minutes. Answers can't be changed once submitted, and results are recorded.`
                : "Take your time — you'll see the correct answer and an explanation after each question."}
            </p>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.12em", color: C.mist, margin: "18px 0 6px" }}>Your name {mode === "cert" && "(appears on certificate)"}</label>
            <input value={studentName} onChange={(e) => setStudentName(e.target.value)} placeholder="e.g. Jordan Tanaka"
              style={{ width: "100%", boxSizing: "border-box", padding: "11px 12px", fontSize: 15, border: `1px solid ${C.line}`, borderRadius: 3, fontFamily: fontBody, background: C.rice }} />
            <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
              <button onClick={begin} disabled={mode === "cert" && !studentName.trim()}
                style={{ flex: 1, background: mode === "cert" ? C.hanko : C.indigo, opacity: mode === "cert" && !studentName.trim() ? 0.45 : 1, color: "#fff", border: "none", borderRadius: 3, padding: "12px 0", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}>
                {mode === "cert" ? `Start timer — ${EXAM_MINUTES}:00` : "Begin"}
              </button>
              <button onClick={() => setView("home")} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 3, padding: "12px 18px", fontSize: 14, cursor: "pointer", fontFamily: fontBody, color: C.ink }}>Cancel</button>
            </div>
          </div>
        )}

        {/* ——— EXAM RUNNER ——— */}
        {view === "run" && q && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <span style={{ fontFamily: fontMono, fontSize: 12.5, color: C.mist }}>Question {idx + 1} of {questions.length}</span>
              {mode === "cert" && (
                <span style={{ fontFamily: fontMono, fontSize: 15, fontWeight: 500, color: timeLeft < 60 ? C.hanko : C.indigoDeep, background: C.paper, border: `1px solid ${timeLeft < 60 ? C.hanko : C.line}`, borderRadius: 3, padding: "5px 12px" }}>
                  {mm}:{ss}
                </span>
              )}
            </div>
            <div style={{ height: 3, background: C.line, borderRadius: 2, marginBottom: 28 }}>
              <div style={{ height: "100%", width: `${((idx) / questions.length) * 100}%`, background: mode === "cert" ? C.hanko : C.indigo, borderRadius: 2, transition: "width .3s" }} />
            </div>
            <h2 style={{ fontFamily: fontDisplay, fontSize: 23, fontWeight: 700, lineHeight: 1.4, marginBottom: 24 }}>{q.prompt}</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {q.options.map((opt, i) => {
                const chosen = answers[idx] === i;
                let border = C.line, bg = C.paper;
                if (mode === "practice" && revealed) {
                  if (i === q.answer) { border = "#2E7D46"; bg = "#EEF6EF"; }
                  else if (chosen) { border = C.hanko; bg = "#FAEDED"; }
                } else if (chosen) { border = C.indigo; bg = "#EEF1F6"; }
                return (
                  <button key={i} className="opt" onClick={() => choose(i)}
                    style={{ textAlign: "left", background: bg, border: `1.5px solid ${border}`, borderRadius: 4, padding: "14px 16px", fontSize: 15, fontFamily: fontBody, cursor: "pointer", color: C.ink, lineHeight: 1.4 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 12, color: C.mist, marginRight: 10 }}>{String.fromCharCode(65 + i)}</span>
                    {opt}
                  </button>
                );
              })}
            </div>
            {mode === "practice" && revealed && (
              <div style={{ marginTop: 18, background: "#F1EFE7", borderLeft: `3px solid ${answers[idx] === q.answer ? "#2E7D46" : C.hanko}`, padding: "14px 16px", fontSize: 14, lineHeight: 1.55, color: "#44413A" }}>
                <strong style={{ color: answers[idx] === q.answer ? "#2E7D46" : C.hanko }}>{answers[idx] === q.answer ? "Correct. " : "Not quite. "}</strong>
                {q.explain}
              </div>
            )}
            <div style={{ marginTop: 26, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={next} disabled={answers[idx] === undefined}
                style={{ background: C.indigoDeep, color: "#fff", border: "none", borderRadius: 3, padding: "12px 28px", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: answers[idx] === undefined ? 0.4 : 1, fontFamily: fontBody }}>
                {idx + 1 === questions.length ? "Finish" : "Next question"}
              </button>
            </div>
          </div>
        )}

        {/* ——— RESULT ——— */}
        {view === "result" && lastResult && (
          <div style={{ textAlign: "center", paddingTop: 30 }}>
            <div style={{ position: "relative", display: "inline-block", padding: "10px 0 26px" }}>
              <p style={{ fontFamily: fontMono, fontSize: 13, color: C.mist, margin: 0 }}>{lastResult.mode === "cert" ? "Certification Exam" : "Practice Quiz"}{lastResult.timedOut ? " · time expired" : ""}</p>
              <p style={{ fontFamily: fontDisplay, fontSize: 76, fontWeight: 700, margin: "6px 0 2px", color: C.indigoDeep }}>{lastResult.pct}<span style={{ fontSize: 30 }}>%</span></p>
              <p style={{ fontSize: 14, color: "#55524A", margin: 0 }}>{lastResult.correct} of {lastResult.total} correct</p>
              {lastResult.mode === "cert" && (
                <div className="stamp" style={{ position: "absolute", top: -6, right: -110, width: 96, height: 96, border: `3.5px solid ${lastResult.passed ? C.hanko : C.mist}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-8deg)", animation: "stamp .45s cubic-bezier(.2,.9,.3,1.2) both", color: lastResult.passed ? C.hanko : C.mist }}>
                  <span style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: lastResult.passed ? 22 : 15, letterSpacing: "0.05em" }}>{lastResult.passed ? "合格" : "再挑戦"}</span>
                </div>
              )}
            </div>
            {lastResult.mode === "cert" && (
              <p style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, color: lastResult.passed ? C.hanko : C.ink, margin: "0 0 8px" }}>
                {lastResult.passed ? "Passed — congratulations." : "Below the pass mark this time."}
              </p>
            )}
            <p style={{ fontSize: 14, color: "#55524A", maxWidth: 420, margin: "0 auto 30px", lineHeight: 1.55 }}>
              {lastResult.mode === "cert"
                ? lastResult.passed ? "Your result has been recorded. Your certificate is ready below." : `A score of ${PASS_PCT}% is required. Review with practice mode, then try again.`
                : "Nice work. Every question you missed showed its explanation along the way — repeat anytime."}
            </p>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
              {lastResult.mode === "cert" && lastResult.passed && (
                <button onClick={() => setView("certificate")} style={{ background: C.gold, color: "#fff", border: "none", borderRadius: 3, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}>View certificate</button>
              )}
              <button onClick={() => setView("home")} style={{ background: C.indigo, color: "#fff", border: "none", borderRadius: 3, padding: "12px 24px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}>Back to portal</button>
            </div>
          </div>
        )}

        {/* ——— CERTIFICATE ——— */}
        {view === "certificate" && lastResult && (
          <div style={{ background: C.paper, border: `1px solid ${C.gold}`, outline: `1px solid ${C.gold}`, outlineOffset: 6, borderRadius: 2, padding: "56px 40px", textAlign: "center", position: "relative", maxWidth: 620, margin: "20px auto" }}>
            <p style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.3em", color: C.gold, fontWeight: 600, margin: 0 }}>Sake Studies Center</p>
            <h2 style={{ fontFamily: fontDisplay, fontSize: 30, fontWeight: 700, margin: "14px 0 6px" }}>Certificate of Achievement</h2>
            <p style={{ fontSize: 13, color: C.mist, margin: "0 0 26px" }}>This certifies that</p>
            <p style={{ fontFamily: fontDisplay, fontSize: 32, fontWeight: 700, color: C.indigoDeep, margin: "0 0 6px", borderBottom: `1px solid ${C.line}`, display: "inline-block", padding: "0 26px 8px" }}>{lastResult.name}</p>
            <p style={{ fontSize: 14, color: "#55524A", lineHeight: 1.6, maxWidth: 400, margin: "18px auto 30px" }}>
              has passed the Sake Fundamentals Certification Exam with a score of <strong>{lastResult.pct}%</strong> on {lastResult.date}.
            </p>
            <div style={{ position: "absolute", bottom: 30, right: 34, width: 74, height: 74, border: `3px solid ${C.hanko}`, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-8deg)", color: C.hanko }}>
              <span style={{ fontFamily: fontDisplay, fontWeight: 700, fontSize: 17 }}>合格</span>
            </div>
            <button onClick={() => setView("home")} style={{ background: "transparent", border: `1px solid ${C.line}`, borderRadius: 3, padding: "10px 20px", fontSize: 13, cursor: "pointer", fontFamily: fontBody, color: C.ink }}>Back to portal</button>
          </div>
        )}

        {/* ——— ADMIN ——— */}
        {view === "admin" && (
          <div>
            <h1 style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 700, margin: "0 0 4px" }}>Instructor dashboard</h1>
            <p style={{ fontSize: 14, color: "#55524A", marginBottom: 24 }}>Manage the question bank and review recorded attempts.</p>
            <div style={{ display: "flex", gap: 6, marginBottom: 22, borderBottom: `1px solid ${C.line}` }}>
              {[["bank", `Question bank (${bank.length})`], ["results", `Results (${attempts.length})`]].map(([t, label]) => (
                <button key={t} onClick={() => setAdminTab(t)}
                  style={{ background: "transparent", border: "none", borderBottom: adminTab === t ? `2px solid ${C.hanko}` : "2px solid transparent", padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", color: adminTab === t ? C.ink : C.mist, fontFamily: fontBody }}>
                  {label}
                </button>
              ))}
            </div>

            {adminTab === "bank" && (
              <div>
                <div style={{ display: "grid", gap: 8, marginBottom: 30 }}>
                  {bank.map((b, i) => (
                    <div key={b.id} style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 3, padding: "12px 16px", display: "flex", gap: 12, alignItems: "baseline" }}>
                      <span style={{ fontFamily: fontMono, fontSize: 11, color: C.mist, minWidth: 24 }}>{String(i + 1).padStart(2, "0")}</span>
                      <div style={{ flex: 1 }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 500 }}>{b.prompt}</p>
                        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#2E7D46" }}>✓ {b.options[b.answer]}</p>
                      </div>
                      {b.id.startsWith("c") && <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: C.gold, fontWeight: 600 }}>Custom</span>}
                    </div>
                  ))}
                </div>
                <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, padding: 22 }}>
                  <h3 style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, marginTop: 0 }}>Add a question</h3>
                  <input value={newQ.prompt} onChange={(e) => setNewQ({ ...newQ, prompt: e.target.value })} placeholder="Question prompt"
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 3, marginBottom: 10, fontFamily: fontBody, background: C.rice }} />
                  {newQ.options.map((o, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                      <input type="radio" name="correct" checked={newQ.answer === i} onChange={() => setNewQ({ ...newQ, answer: i })} aria-label={`Mark option ${i + 1} correct`} />
                      <input value={o} onChange={(e) => { const opts = [...newQ.options]; opts[i] = e.target.value; setNewQ({ ...newQ, options: opts }); }} placeholder={`Option ${String.fromCharCode(65 + i)}${newQ.answer === i ? " (correct)" : ""}`}
                        style={{ flex: 1, padding: "9px 12px", fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 3, fontFamily: fontBody, background: C.rice }} />
                    </div>
                  ))}
                  <input value={newQ.explain} onChange={(e) => setNewQ({ ...newQ, explain: e.target.value })} placeholder="Explanation shown in practice mode (optional)"
                    style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 3, margin: "4px 0 14px", fontFamily: fontBody, background: C.rice }} />
                  <button onClick={addQuestion} style={{ background: C.indigo, color: "#fff", border: "none", borderRadius: 3, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}>Add to bank</button>
                </div>
              </div>
            )}

            {adminTab === "results" && (
              attempts.length === 0 ? (
                <p style={{ fontSize: 14, color: C.mist, background: C.paper, border: `1px dashed ${C.line}`, borderRadius: 4, padding: 28, textAlign: "center" }}>
                  No attempts recorded yet. Completed quizzes and exams will appear here.
                </p>
              ) : (
                <div style={{ background: C.paper, border: `1px solid ${C.line}`, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr .7fr .9fr 1.1fr", padding: "10px 16px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: C.mist, fontWeight: 600, borderBottom: `1px solid ${C.line}` }}>
                    <span>Student</span><span>Type</span><span>Score</span><span>Outcome</span><span>Date</span>
                  </div>
                  {attempts.map((a, i) => (
                    <div key={a.ts + "-" + i} style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr .7fr .9fr 1.1fr", padding: "12px 16px", fontSize: 13.5, borderBottom: i < attempts.length - 1 ? `1px solid ${C.line}` : "none", alignItems: "center" }}>
                      <span style={{ fontWeight: 500 }}>{a.name}</span>
                      <span style={{ color: "#55524A" }}>{a.mode === "cert" ? "Certification" : "Practice"}</span>
                      <span style={{ fontFamily: fontMono }}>{a.pct}%</span>
                      <span style={{ color: a.mode !== "cert" ? C.mist : a.passed ? "#2E7D46" : C.hanko, fontWeight: 600 }}>
                        {a.mode !== "cert" ? "—" : a.passed ? "Passed" : "Not passed"}
                      </span>
                      <span style={{ color: C.mist, fontSize: 12.5 }}>{a.date}</span>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>
        )}
      </main>
    </div>
  );
}
