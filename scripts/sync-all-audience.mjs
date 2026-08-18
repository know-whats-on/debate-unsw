/**
 * Puts the WHOLE cohort (all 49 students) into every INFS2604 debate so
 * anyone can join any debate and engage. Each student gets ONE join code that
 * works on all four debates. In a given debate, a student who debates that
 * topic keeps their For/Against team; everyone else is "audience".
 *
 * Rebuilds each debate's students + joinCodes subcollections (safe: these
 * debates are "ready" and haven't been run — no votes/comments yet).
 *
 *   node scripts/sync-all-audience.mjs            # dry run
 *   node scripts/sync-all-audience.mjs --execute  # apply
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

/* ---- parse the cohort (same shifted-column mapping as bulk-create) ---- */
const rows = readFileSync(DL + "/INFS2604 - Debate Groups Sheet - Debaters.csv", "utf8")
  .split("\n").slice(1).map((l) => l.trim()).filter(Boolean);
const cohort = rows.map((line) => {
  const c = line.split(",");
  const firstName = (c[0] ?? "").trim();
  let lastName = (c[1] ?? "").trim();
  if (lastName === ".") lastName = "";
  const zid = (c[2] ?? "").trim();
  return {
    firstName, lastName,
    fullName: [firstName, lastName].filter(Boolean).join(" "),
    universityStudentId: zid,
    email: `${zid.toLowerCase()}@student.unsw.edu.au`,
    speakingRole: (c[3] ?? "").trim(),
    group: (c[4] ?? "").trim(),
    topic: (c[5] ?? "").trim(),
    side: /against|more harm/i.test((c[6] ?? "")) ? "against" : "for",
  };
});
const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();

const TOPICS = [
  "Should Universities replace Academic Staff with AI Tutors?",
  "Should AI generated content be eligible for artistic awards?",
  "Does AI bring more harm or more good?",
  "Should we use AI for recruitment?",
];

/* ---- one globally-unique code per student ---- */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const used = new Set();
const gen = () => {
  let code;
  do { code = Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join(""); }
  while (used.has(code));
  used.add(code);
  return code;
};
for (const s of cohort) s.code = gen();

console.log(`Cohort: ${cohort.length} students · one code each, valid on all ${TOPICS.length} debates.`);
console.log("Per debate: debaters of that topic keep their team; the other ~37 are audience.\n");

if (!EXECUTE) {
  for (const t of TOPICS) {
    const debaters = cohort.filter((s) => norm(s.topic) === norm(t));
    console.log(`  ${t}: ${debaters.length} debaters + ${cohort.length - debaters.length} audience = ${cohort.length}`);
  }
  console.log("\nDRY RUN — nothing written. Re-run with --execute.");
  process.exit(0);
}

/* ---- apply ---- */
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const db = getFirestore();
const uid = (await getAuth().getUserByEmail("admin@debate.com")).uid;
const course = (await db.collection("courses")
  .where("instructorId", "==", uid).where("courseCode", "==", "INFS2604").limit(1).get()).docs[0];

// Find the 4 target debates: non-ended, matching a topic, already populated
const all = await db.collection("debates")
  .where("instructorId", "==", uid).where("courseId", "==", course.id).get();
const targets = [];
for (const topic of TOPICS) {
  const match = [];
  for (const doc of all.docs) {
    if (doc.data().status === "ended") continue;
    if (norm(doc.data().title) !== norm(topic)) continue;
    const n = (await doc.ref.collection("students").limit(1).get()).size;
    if (n > 0) match.push(doc);
  }
  if (match.length !== 1) {
    console.log(`🛑 Expected exactly 1 active debate for "${topic}", found ${match.length}. Aborting.`);
    process.exit(2);
  }
  targets.push({ topic, ref: match[0].ref });
}

for (const { topic, ref } of targets) {
  // wipe existing students + joinCodes
  for (const col of ["students", "joinCodes"]) {
    const snap = await ref.collection(col).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  // recreate full cohort
  const now = FieldValue.serverTimestamp();
  for (const s of cohort) {
    const isDebater = norm(s.topic) === norm(topic);
    const studentRef = await ref.collection("students").add({
      debateId: ref.id,
      firstName: s.firstName, lastName: s.lastName, fullName: s.fullName,
      universityStudentId: s.universityStudentId, email: s.email,
      joinCode: s.code, joined: false,
      assignedSide: isDebater ? s.side : "audience",
      speakingRole: isDebater ? s.speakingRole : "",
      group: s.group,
      createdAt: now, updatedAt: now,
    });
    await ref.collection("joinCodes").doc(s.code).set({
      joinCode: s.code, debateId: ref.id, studentDocId: studentRef.id, used: false, createdAt: now,
    });
  }
  console.log(`✓ ${topic} — ${cohort.length} students synced`);
}

/* ---- one-code-per-student CSV ---- */
const csvRows = [["Student Name", "Student ID", "Join Code (works on all 4 debates)", "Debating In", "Their Team"]];
for (const s of [...cohort].sort((a, b) => a.fullName.localeCompare(b.fullName))) {
  csvRows.push([s.fullName, s.universityStudentId, s.code, s.topic, s.side === "for" ? "For / More Good" : "Against / More Harm"]);
}
const csv = csvRows.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\r\n");
writeFileSync(DL + "/INFS2604-join-codes.csv", "﻿" + csv, "utf8");
console.log(`\nOne code per student → Downloads/INFS2604-join-codes.csv`);
process.exit(0);
