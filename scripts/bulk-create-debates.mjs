/**
 * Bulk-creates the INFS2604 debates from the two Google-Sheet CSVs.
 * Dry-run by default; pass --execute to write to Firestore.
 *
 *   node scripts/bulk-create-debates.mjs            # audit / parse check
 *   node scripts/bulk-create-debates.mjs --execute  # create the debates
 *
 * NOTE on the Debaters CSV: its headers are shifted. By POSITION the columns
 * are: First Name, Last Name, Student ID, Speaking Role, Group, Topic, Side.
 * There are no email addresses in the file, so placeholder UNSW-style emails
 * are generated from the zID (the real identifier).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
const EXECUTE = process.argv.includes("--execute");
const DL = homedir() + "/Downloads";

/* ---------------- parse rounds ---------------- */
const roundsCsv = readFileSync(DL + "/INFS2604 - Debate Groups Sheet - Debate Rounds.csv", "utf8");
const ROUNDS = roundsCsv
  .split("\n")
  .slice(1)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((line) => {
    const [, name, mins, brk] = line.split(",");
    const durationSeconds = Math.round(parseFloat(mins) * 60);
    const breakDurationSeconds = Math.round(parseFloat(brk) * 60);
    return {
      title: name.trim(),
      durationSeconds,
      breakAfterEnabled: breakDurationSeconds > 0,
      breakDurationSeconds,
    };
  });

/* ---------------- parse debaters ---------------- */
const debCsv = readFileSync(DL + "/INFS2604 - Debate Groups Sheet - Debaters.csv", "utf8");
const rows = debCsv.split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
const students = rows.map((line) => {
  const c = line.split(",");
  const firstName = (c[0] ?? "").trim();
  let lastName = (c[1] ?? "").trim();
  if (lastName === ".") lastName = "";
  const zid = (c[2] ?? "").trim();
  const speakingRole = (c[3] ?? "").trim();
  const group = (c[4] ?? "").trim();
  const topic = (c[5] ?? "").trim();
  const sideRaw = (c[6] ?? "").trim();
  const side = /against|more harm/i.test(sideRaw) ? "against" : "for";
  return {
    firstName,
    lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" "),
    universityStudentId: zid,
    email: `${zid.toLowerCase()}@student.unsw.edu.au`,
    speakingRole,
    group,
    topic,
    sideRaw,
    side,
  };
});

/* ---------------- group into debates by topic ---------------- */
const TOPIC_ORDER = [
  "Should Universities replace Academic Staff with AI Tutors?",
  "Should AI generated content be eligible for artistic awards?",
  "Does AI bring more harm or more good?",
  "Should we use AI for recruitment?",
];
const LABELS = {
  "Does AI bring more harm or more good?": { forLabel: "More Good", againstLabel: "More Harm" },
};
const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();
const debates = TOPIC_ORDER.map((topic) => {
  const roster = students.filter((s) => norm(s.topic) === norm(topic));
  const labels = LABELS[topic] ?? { forLabel: "For", againstLabel: "Against" };
  return {
    title: topic,
    ...labels,
    roster,
    forCount: roster.filter((s) => s.side === "for").length,
    againstCount: roster.filter((s) => s.side === "against").length,
  };
});

// Any student whose topic didn't match one of the four?
const unmatched = students.filter((s) => !TOPIC_ORDER.some((t) => norm(t) === norm(s.topic)));

/* ---------------- report ---------------- */
console.log(`Rounds parsed: ${ROUNDS.length}`);
console.log(
  "  " +
    ROUNDS.map((r) => `${r.title} (${r.durationSeconds}s${r.breakAfterEnabled ? ` +${r.breakDurationSeconds}s break` : ""})`)
      .join("\n  ")
);
console.log(`\nStudents parsed: ${students.length}`);
console.log(`\nDebates (${debates.length}):`);
for (const d of debates) {
  console.log(`\n  ▸ ${d.title}`);
  console.log(`    ${d.forLabel}: ${d.forCount} · ${d.againstLabel}: ${d.againstCount} · total ${d.roster.length}`);
  for (const s of d.roster) {
    console.log(`      - ${s.fullName} (${s.universityStudentId}) — ${s.side.toUpperCase()} · ${s.speakingRole}`);
  }
}
if (unmatched.length) {
  console.log(`\n⚠ ${unmatched.length} students didn't match a known topic:`);
  for (const s of unmatched) console.log(`   ${s.fullName}: "${s.topic}"`);
}

if (!EXECUTE) {
  console.log("\nDRY RUN — nothing written. Re-run with --execute to create.");
  process.exit(0);
}

/* ---------------- write to Firestore ---------------- */
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const auth = getAuth();
const db = getFirestore();
const uid = (await auth.getUserByEmail("admin@debate.com")).uid;

// INFS2604 course + a class to attach the debates to
const courseSnap = await db.collection("courses")
  .where("instructorId", "==", uid).where("courseCode", "==", "INFS2604").limit(1).get();
if (courseSnap.empty) {
  console.log("🛑 INFS2604 course not found — aborting.");
  process.exit(2);
}
const courseId = courseSnap.docs[0].id;

const classSnap = await db.collection("classes")
  .where("instructorId", "==", uid).where("courseId", "==", courseId).limit(1).get();
let classId;
if (classSnap.empty) {
  const c = await db.collection("classes").add({
    courseId, instructorId: uid, className: "INFS2604 Debate Rounds",
    timezone: "Australia/Sydney", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
  });
  classId = c.id;
} else {
  classId = classSnap.docs[0].id;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const usedCodes = new Set();
const genCode = () => {
  let code;
  do {
    code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  } while (usedCodes.has(code));
  usedCodes.add(code);
  return code;
};
const slug = (n) => Array.from({ length: n }, () => "abcdefghjkmnpqrstuvwxyz23456789"[Math.floor(Math.random() * 31)]).join("");

const codeRows = [["Debate", "Topic", "Student Name", "Student ID", "Side", "Join Code"]];
const links = [];

for (const d of debates) {
  // Skip only if a real duplicate exists: a non-ended debate on this topic
  // that already has students (i.e. one this script created, or a genuine
  // populated one). Ended historical sessions and empty draft stubs don't
  // block creation of the CSV version.
  const existing = await db.collection("debates")
    .where("instructorId", "==", uid).where("courseId", "==", courseId).where("title", "==", d.title).get();
  let activeDup = null;
  for (const doc of existing.docs) {
    if (doc.data().status === "ended") continue;
    const studentCount = (await doc.ref.collection("students").limit(1).get()).size;
    if (studentCount > 0) { activeDup = doc; break; }
  }
  if (activeDup) {
    console.log(`↷ Skipping "${d.title}" — a populated active copy already exists (${activeDup.id}).`);
    continue;
  }
  const otherNote = existing.docs.length
    ? ` (${existing.docs.length} other debate(s) on this topic left untouched)`
    : "";

  const now = FieldValue.serverTimestamp();
  const debateRef = await db.collection("debates").add({
    courseId, classId, instructorId: uid,
    title: d.title, description: "",
    forLabel: d.forLabel, againstLabel: d.againstLabel,
    status: "ready", currentRoundIndex: 0, currentPhase: "round", totalPausedMs: 0,
    audienceJoinSlug: slug(8), displaySlug: slug(8),
    votingEnabled: true, commentsEnabled: true, reactionsEnabled: true,
    reflectionsEnabled: true, publicCommentsEnabled: true, autoStartRounds: false,
    setupStep: 8, createdAt: now, updatedAt: now,
  });

  for (const [i, r] of ROUNDS.entries()) {
    await debateRef.collection("rounds").add({
      debateId: debateRef.id, index: i, title: r.title,
      durationSeconds: r.durationSeconds, breakAfterEnabled: r.breakAfterEnabled,
      breakDurationSeconds: r.breakDurationSeconds, status: "not_started",
    });
  }

  for (const s of d.roster) {
    const code = genCode();
    const studentRef = await debateRef.collection("students").add({
      debateId: debateRef.id,
      firstName: s.firstName, lastName: s.lastName, fullName: s.fullName,
      universityStudentId: s.universityStudentId, email: s.email,
      joinCode: code, joined: false, assignedSide: s.side,
      speakingRole: s.speakingRole, group: s.group,
      createdAt: now, updatedAt: now,
    });
    await debateRef.collection("joinCodes").doc(code).set({
      joinCode: code, debateId: debateRef.id, studentDocId: studentRef.id, used: false, createdAt: now,
    });
    codeRows.push([d.title, d.title, s.fullName, s.universityStudentId, s.side, code]);
  }

  const snap = await debateRef.get();
  links.push({ title: d.title, id: debateRef.id, join: `/join/${snap.data().audienceJoinSlug}`, display: `/display/${debateRef.id}` });
  console.log(`✓ Created "${d.title}" (${debateRef.id}) — ${d.roster.length} students, ${ROUNDS.length} rounds${otherNote}`);
}

// Join-code sheet for distribution
const csv = codeRows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\r\n");
const outPath = DL + "/INFS2604-join-codes.csv";
writeFileSync(outPath, "﻿" + csv, "utf8");

console.log(`\nJoin codes written to: ${outPath}`);
console.log("\nDebate links (base: https://debate.knowwhatson.com):");
for (const l of links) console.log(`  ${l.title}\n    join    ${l.join}\n    display ${l.display}`);
process.exit(0);
