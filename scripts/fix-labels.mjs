/**
 * Fixes INFS2604 debate team labels + regenerates the join-code CSV with the
 * correct per-debate team name for each student. Dry-run unless --execute.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const env = readFileSync("/Users/rushi/Downloads/New_Debate/.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const EXECUTE = process.argv.includes("--execute");
const DL = homedir() + "/Downloads";
const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();

// intended team labels per topic (source sheet used "Yes (For)/No (Against)")
const LABELS = {
  "should universities replace academic staff with ai tutors?": { forLabel: "Yes", againstLabel: "No" },
  "should ai generated content be eligible for artistic awards?": { forLabel: "Yes", againstLabel: "No" },
  "should we use ai for recruitment?": { forLabel: "Yes", againstLabel: "No" },
  "does ai bring more harm or more good?": { forLabel: "More Good", againstLabel: "More Harm" },
};

initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const uid = (await getAuth().getUserByEmail("admin@debate.com")).uid;
const course = (await db.collection("courses").where("instructorId", "==", uid).where("courseCode", "==", "INFS2604").limit(1).get()).docs[0];
const all = await db.collection("debates").where("instructorId", "==", uid).where("courseId", "==", course.id).get();

const TOPICS = Object.keys(LABELS);
const csvRows = [["Student Name", "Student ID", "Join Code (works on all 4 debates)", "Debating In", "Their Team"]];
const seen = new Set();

for (const topic of TOPICS) {
  const doc = all.docs.find((d) => d.data().status !== "ended" && norm(d.data().title) === topic && d.data().setupStep === 8);
  if (!doc) { console.log(`🛑 no active debate for "${topic}"`); continue; }
  const labels = LABELS[topic];
  const cur = doc.data();
  console.log(`\n${cur.title}`);
  console.log(`  labels: ${cur.forLabel} / ${cur.againstLabel}  ->  ${labels.forLabel} / ${labels.againstLabel}`);
  if (EXECUTE) await doc.ref.update({ forLabel: labels.forLabel, againstLabel: labels.againstLabel, updatedAt: FieldValue.serverTimestamp() });

  const studs = (await doc.ref.collection("students").get()).docs.map((x) => x.data());
  for (const s of studs) {
    if (s.assignedSide === "audience") continue; // only their debating row
    if (seen.has(s.universityStudentId)) continue;
    seen.add(s.universityStudentId);
    const team = s.assignedSide === "for" ? labels.forLabel : labels.againstLabel;
    csvRows.push([s.fullName, s.universityStudentId, s.joinCode, cur.title, team]);
  }
}

// sample preview of the corrected rows
console.log("\nSample corrected CSV rows (Name | ID | Debating In | Their Team):");
for (const row of csvRows.filter((row, i) => i > 0 && /Xinyi|Zining|William|Tyson|Yiren/.test(row[0]))) {
  console.log("  " + row[0] + " | " + row[1] + " | " + row[3] + " | " + row[4]);
}

if (EXECUTE) {
  const csv = csvRows.sort((a, b) => (a[0] === "Student Name" ? -1 : a[0].localeCompare(b[0]))).map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\r\n");
  writeFileSync(DL + "/INFS2604-join-codes.csv", "﻿" + csv, "utf8");
  console.log(`\n✓ Labels updated + CSV rewritten (${csvRows.length - 1} students) → Downloads/INFS2604-join-codes.csv`);
} else {
  console.log("\nDRY RUN — nothing written. Re-run with --execute.");
}
process.exit(0);
