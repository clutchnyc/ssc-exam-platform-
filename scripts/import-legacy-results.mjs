// Import legacy Sake Server Certification results (Respondent Score
// Listing CSV) into the new platform.
//
//   node scripts/import-legacy-results.mjs <csv-path>            # dry run
//   node scripts/import-legacy-results.mjs <csv-path> --execute  # real import
//
// Dry run is entirely local: parses, validates, and prints the plan plus
// a name-cleanup review list. --execute needs env vars:
//   SUPABASE_URL                (https://<ref>.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY   (temporary; revoke/rotate after the run)
//
// Per row: auth user (email-confirmed, passwordless — magic link just
// works) → profile → course enrollment (professional course) → attempt
// (real score/dates, source 'thinkific') → certificate for passers
// (verify code minted with the ORIGINAL exam year, issued_at = original
// finish time). Idempotent: rows whose (user, started_at, source) attempt
// already exists are skipped, so re-runs are safe.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CSV_PATH = process.argv[2];
const EXECUTE = process.argv.includes("--execute");
const COURSE_SLUG = "sake-server-certification";
const EXAM_SLUG = "sake-server";
const LEGACY_PASS_PCT = 75;
const SOURCE = "thinkific";
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // matches submit-attempt

if (!CSV_PATH) {
  console.error("Usage: node scripts/import-legacy-results.mjs <csv-path> [--execute]");
  process.exit(1);
}

// ——— CSV parsing (quoted fields, no embedded newlines in this report) ———
function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = [];
    let cur = "", inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  };
  const header = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

// ——— Name cleanup: "Last, First" → "First Last", fix case ———
const fixedNames = [];
function fixCaseToken(tok) {
  if (!tok) return tok;
  if (tok === tok.toLowerCase() || tok === tok.toUpperCase()) {
    return tok
      .split(/([-'])/)
      .map((p) => (p === "-" || p === "'" ? p : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
      .join("");
  }
  return tok; // mixed case (van der, McX, DiMaggio) — leave as typed
}
function cleanName(raw) {
  const [last, first] = raw.split(",").map((s) => s.trim());
  const flipped = `${first ?? ""} ${last ?? ""}`.trim();
  const fixed = flipped.split(/\s+/).map(fixCaseToken).join(" ");
  if (fixed !== flipped) fixedNames.push({ from: flipped, to: fixed });
  return fixed;
}

// ——— Dates: report times are US-East local; approximate DST by month ———
function toIso(usDate) {
  const m = usDate.match(/^(\d+)\/(\d+)\/(\d+) (\d+):(\d+):(\d+) (AM|PM)$/);
  if (!m) throw new Error(`Unparseable date: ${usDate}`);
  let [, mo, d, y, h, mi, s, ap] = m;
  h = Number(h) % 12 + (ap === "PM" ? 12 : 0);
  const offset = Number(mo) >= 4 && Number(mo) <= 10 ? "-04:00" : "-05:00";
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(mo)}-${pad(d)}T${pad(h)}:${pad(mi)}:${pad(s)}${offset}`;
}

function makeVerifyCode(year) {
  let code = "";
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `SSC-${year}-${code}`;
}

// ——— Load and validate ———
const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
const records = rows.map((r) => {
  const score = Number(r.txtScore);
  const passed = r.txtPassFail === "Pass";
  if (!r.txtRespPk.includes("@")) throw new Error(`Bad email: ${r.txtRespPk}`);
  if (!Number.isInteger(score)) throw new Error(`Bad score for ${r.txtRespPk}`);
  if (passed !== (score >= LEGACY_PASS_PCT)) {
    console.warn(`⚠ pass/score mismatch for ${r.txtRespPk}: score ${score}, marked ${r.txtPassFail}`);
  }
  return {
    email: r.txtRespPk.trim().toLowerCase(),
    name: cleanName(r.txtRespName),
    score,
    passed,
    started_at: toIso(r.txtDateStarted),
    submitted_at: toIso(r.txtDateFinished),
    year: new Date(toIso(r.txtDateFinished)).getFullYear(),
    attempt_no: Number(r.txtAttempt),
  };
});

const byEmail = new Map();
for (const rec of records) {
  if (!byEmail.has(rec.email)) byEmail.set(rec.email, []);
  byEmail.get(rec.email).push(rec);
}

console.log(`Parsed ${records.length} attempts across ${byEmail.size} students`);
console.log(`Passers (get certificates): ${records.filter((r) => r.passed).length}`);
console.log(`Fails (attempt record only): ${records.filter((r) => !r.passed).length}`);
console.log(`Certificate years: ${JSON.stringify([...records.filter((r) => r.passed).reduce((m, r) => m.set(r.year, (m.get(r.year) ?? 0) + 1), new Map())].sort())}`);
if (fixedNames.length) {
  console.log(`\nName case fixes applied (${fixedNames.length}) — review:`);
  for (const f of [...new Map(fixedNames.map((x) => [x.from, x])).values()]) {
    console.log(`  "${f.from}"  →  "${f.to}"`);
  }
}

if (!EXECUTE) {
  console.log("\nDry run only — nothing written. Re-run with --execute to import.");
  process.exit(0);
}

// ——— Real import ———
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for --execute");
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: course } = await db.from("courses").select("id").eq("slug", COURSE_SLUG).single();
const { data: exam } = await db.from("exams").select("id").eq("slug", EXAM_SLUG).single();
if (!course || !exam) throw new Error("Course or exam not found — check slugs");

let created = 0, existing = 0, attempts = 0, certs = 0, skipped = 0;

for (const [email, recs] of byEmail) {
  // 1. Auth user (email-confirmed so magic links work immediately)
  let userId;
  const { data: createdUser, error: createErr } = await db.auth.admin.createUser({
    email,
    email_confirm: true,
  });
  if (createErr) {
    if (!/already/i.test(createErr.message)) throw new Error(`${email}: ${createErr.message}`);
    // Exists (overlap with a native signup) — find their id by paging.
    let page = 1;
    while (!userId) {
      const { data: list } = await db.auth.admin.listUsers({ page, perPage: 200 });
      const hit = list.users.find((u) => u.email?.toLowerCase() === email);
      if (hit) userId = hit.id;
      else if (list.users.length < 200) throw new Error(`${email}: exists but not found`);
      else page++;
    }
    existing++;
  } else {
    userId = createdUser.user.id;
    created++;
  }

  // 2. Profile (keep an existing self-chosen name if one exists)
  const name = recs[0].name;
  const { data: prof } = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
  if (!prof) {
    const { error } = await db.from("profiles").insert({ id: userId, full_name: name });
    if (error) throw new Error(`${email} profile: ${error.message}`);
  }

  // 3. Course enrollment
  const { data: enr, error: enrErr } = await db
    .from("course_enrollments")
    .upsert({ profile_id: userId, course_id: course.id }, { onConflict: "profile_id,course_id" })
    .select("id")
    .single();
  if (enrErr) throw new Error(`${email} enrollment: ${enrErr.message}`);

  // 4. Attempts + certificates (idempotent per started_at)
  for (const rec of recs.sort((a, b) => a.attempt_no - b.attempt_no)) {
    const { data: dupe } = await db
      .from("attempts")
      .select("id")
      .eq("user_id", userId)
      .eq("source", SOURCE)
      .eq("started_at", rec.started_at)
      .maybeSingle();
    if (dupe) { skipped++; continue; }

    const { data: attempt, error: attErr } = await db
      .from("attempts")
      .insert({
        user_id: userId,
        exam_id: exam.id,
        enrollment_id: enr.id,
        question_set: [],
        score_pct: rec.score,
        passed: rec.passed,
        started_at: rec.started_at,
        submitted_at: rec.submitted_at,
        flagged_late: false,
        source: SOURCE,
      })
      .select("id")
      .single();
    if (attErr) throw new Error(`${email} attempt: ${attErr.message}`);
    attempts++;

    if (rec.passed) {
      let inserted = false;
      for (let i = 0; i < 5 && !inserted; i++) {
        const { error: certErr } = await db.from("certificates").insert({
          attempt_id: attempt.id,
          user_id: userId,
          enrollment_id: enr.id,
          cert_type: "professional",
          verify_code: makeVerifyCode(rec.year),
          issued_at: rec.submitted_at,
          source: SOURCE,
        });
        if (!certErr) inserted = true;
        else if (certErr.code !== "23505") throw new Error(`${email} cert: ${certErr.message}`);
      }
      if (!inserted) throw new Error(`${email}: verify-code collisions x5`);
      certs++;
    }
  }
  process.stdout.write(`\r${created + existing}/${byEmail.size} students…`);
}

console.log(`\nDone. users created ${created} · already existed ${existing} · attempts ${attempts} · certificates ${certs} · skipped dupes ${skipped}`);
