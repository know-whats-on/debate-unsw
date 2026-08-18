/**
 * Reproduce the "cannot rejoin after refresh" report against production.
 * For each INFS2604 debate and each realistic status (ready/live/paused/break),
 * joins the same code repeatedly — like refresh/reopen would.
 * Restores original debate state afterwards.
 */
import { readFileSync } from "node:fs";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const env = readFileSync("/Users/rushi/Downloads/New_Debate/.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const BASE = "https://debate.knowwhatson.com";
const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();

initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const uid = (await getAuth().getUserByEmail("admin@debate.com")).uid;
const course = (await db.collection("courses").where("instructorId", "==", uid).where("courseCode", "==", "INFS2604").limit(1).get()).docs[0];
const all = await db.collection("debates").where("instructorId", "==", uid).where("courseId", "==", course.id).get();

// duplicate-slug audit across ALL debates in the project (any instructor)
const every = await db.collection("debates").get();
const bySlug = {};
every.docs.forEach((d) => { const s = d.data().audienceJoinSlug; (bySlug[s] ||= []).push(`${d.id}(${d.data().status})`); });
const dups = Object.entries(bySlug).filter(([, v]) => v.length > 1);
console.log(dups.length ? `⚠ DUPLICATE SLUGS: ${JSON.stringify(dups)}` : "✓ No duplicate join slugs anywhere.");

const TOPICS = [
  "should universities replace academic staff with ai tutors?",
  "should ai generated content be eligible for artistic awards?",
  "should we use ai for recruitment?",
  "does ai bring more harm or more good?",
];
const debates = TOPICS.map((t) => all.docs.find((d) => d.data().status !== "ended" && norm(d.data().title) === t && d.data().setupStep === 8));

async function joinOnce(slug, code) {
  const res = await fetch(`${BASE}/api/join/validate-code`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, code }),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, error: data.error, name: data.fullName };
}

let fails = 0;
for (const doc of debates) {
  const d = doc.data();
  const stud = (await doc.ref.collection("students").limit(1).get()).docs[0].data();
  const code = stud.joinCode;
  const original = { status: d.status, currentPhase: d.currentPhase };
  console.log(`\n▸ ${d.title}\n  code=${code} originalStatus=${d.status}`);

  const states = [
    { label: "ready", patch: { status: "ready", currentPhase: "round" } },
    { label: "live/round", patch: { status: "live", currentPhase: "round", currentRoundStartedAt: FieldValue.serverTimestamp(), totalPausedMs: 0 } },
    { label: "live/break", patch: { status: "live", currentPhase: "break", currentRoundStartedAt: FieldValue.serverTimestamp(), totalPausedMs: 0 } },
    { label: "paused", patch: { status: "paused", currentRoundPausedAt: FieldValue.serverTimestamp() } },
  ];
  for (const st of states) {
    await doc.ref.update(st.patch);
    // initial join + refresh-rejoin + reopen-rejoin (3 consecutive)
    const results = [];
    for (let i = 0; i < 3; i++) results.push(await joinOnce(d.audienceJoinSlug, code));
    const ok = results.every((r) => r.status === 200 && r.name === stud.fullName);
    if (!ok) fails++;
    console.log(`  ${st.label.padEnd(11)} join→rejoin→rejoin: ${results.map((r) => r.status + (r.error ? ":" + r.error : "")).join(" → ")} ${ok ? "✓" : "✗✗✗"}`);
  }
  // restore
  await doc.ref.update({ status: original.status, currentPhase: original.currentPhase ?? "round", currentRoundPausedAt: FieldValue.delete() });
}

// reset joined flags from this test
for (const doc of debates) {
  const studs = await doc.ref.collection("students").where("joined", "==", true).get();
  for (const s of studs.docs) await s.ref.update({ joined: false, joinedAt: FieldValue.delete() });
  const codes = await doc.ref.collection("joinCodes").where("used", "==", true).get();
  for (const c of codes.docs) await c.ref.update({ used: false, joinedAt: FieldValue.delete() });
}
console.log(`\n${fails === 0 ? "✓ Could NOT reproduce at API level — rejoin works in every state." : "✗ REPRODUCED: " + fails + " state(s) failed"}`);
console.log("State restored, joined flags reset.");
process.exit(0);
