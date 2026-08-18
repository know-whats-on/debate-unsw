/**
 * Exhaustive verification for the INFS2604 debates:
 *   PART A — every student's team matches the source sheet (all debates).
 *   PART B — every join code works on every debate via the LIVE production
 *            join API, then resets joined/used flags to pristine state.
 *
 *   node scripts/verify-all.mjs
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const env = readFileSync("/Users/rushi/Downloads/New_Debate/.env.local", "utf8");
for (const l of env.split("\n")) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const DL = homedir() + "/Downloads";
const BASE = "https://debate.knowwhatson.com";
const norm = (t) => t.replace(/\s+/g, " ").trim().toLowerCase();

const LABELS = {
  "should universities replace academic staff with ai tutors?": { for: "Yes", against: "No" },
  "should ai generated content be eligible for artistic awards?": { for: "Yes", against: "No" },
  "should we use ai for recruitment?": { for: "Yes", against: "No" },
  "does ai bring more harm or more good?": { for: "More Good", against: "More Harm" },
};

/* source of truth: zid -> {fullName, topic, side, raw} */
const src = {};
for (const line of readFileSync(DL + "/INFS2604 - Debate Groups Sheet - Debaters.csv", "utf8").split("\n").slice(1).map((l) => l.trim()).filter(Boolean)) {
  const c = line.split(",");
  const zid = (c[2] || "").trim();
  let last = (c[1] || "").trim(); if (last === ".") last = "";
  src[zid] = {
    fullName: [(c[0] || "").trim(), last].filter(Boolean).join(" "),
    topic: (c[5] || "").trim(),
    side: /against|more harm/i.test(c[6] || "") ? "against" : "for",
    raw: (c[6] || "").trim(),
  };
}

initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) });
const db = getFirestore();
const uid = (await getAuth().getUserByEmail("admin@debate.com")).uid;
const course = (await db.collection("courses").where("instructorId", "==", uid).where("courseCode", "==", "INFS2604").limit(1).get()).docs[0];
const all = await db.collection("debates").where("instructorId", "==", uid).where("courseId", "==", course.id).get();

const TOPICS = Object.keys(LABELS);
const debates = TOPICS.map((t) => {
  const doc = all.docs.find((d) => d.data().status !== "ended" && norm(d.data().title) === t && d.data().setupStep === 8);
  return { topic: t, doc, data: doc.data() };
});

/* ---------------- PART A: team correctness ---------------- */
console.log("PART A — team assignment for ALL students\n");
let aFail = 0;
let checked = 0;
const debaterHome = {}; // zid -> [topics where debater]
for (const { topic, doc, data } of debates) {
  const studs = (await doc.ref.collection("students").get()).docs.map((x) => x.data());
  const expLabels = LABELS[topic];
  // debate labels correct?
  if (data.forLabel !== expLabels.for || data.againstLabel !== expLabels.against) {
    console.log(`  ✗ "${data.title}" labels are ${data.forLabel}/${data.againstLabel}, expected ${expLabels.for}/${expLabels.against}`);
    aFail++;
  }
  for (const s of studs) {
    const truth = src[s.universityStudentId];
    if (!truth) { console.log(`  ✗ ${s.fullName} (${s.universityStudentId}) not in source sheet`); aFail++; continue; }
    const isDebaterHere = norm(truth.topic) === topic;
    const expectedSide = isDebaterHere ? truth.side : "audience";
    if (s.assignedSide !== expectedSide) {
      console.log(`  ✗ ${s.fullName} in "${data.title}": side=${s.assignedSide} expected=${expectedSide}`);
      aFail++;
    }
    if (isDebaterHere) {
      (debaterHome[s.universityStudentId] ||= []).push(topic);
      checked++;
    }
  }
}
// every student debates in exactly one debate
for (const zid of Object.keys(src)) {
  const homes = debaterHome[zid] || [];
  if (homes.length !== 1) { console.log(`  ✗ ${src[zid].fullName} (${zid}) is a debater in ${homes.length} debates (expected 1)`); aFail++; }
}
console.log(`\n  Debater rows checked: ${checked} · unique students: ${Object.keys(src).length}`);
console.log(aFail === 0 ? "  ✓ PART A PASSED — every team correct, everyone debates exactly once.\n" : `  ✗ PART A: ${aFail} problems\n`);

// full per-student team table
console.log("  Full roster (each student's home debate + team):");
for (const zid of Object.keys(src).sort((a, b) => src[a].fullName.localeCompare(src[b].fullName))) {
  const t = src[zid];
  const lbl = LABELS[norm(t.topic)][t.side];
  console.log(`    ${t.fullName.padEnd(22)} ${zid}  ${lbl.padEnd(10)} ${t.topic}`);
}

/* ---------------- PART B: every code works on every debate ---------------- */
console.log("\nPART B — testing every code against every debate on the LIVE API\n");
// the 49 codes (same set in every debate)
const codeToZid = {};
{
  const studs = (await debates[0].doc.ref.collection("students").get()).docs.map((x) => x.data());
  for (const s of studs) codeToZid[s.joinCode] = s.universityStudentId;
}
const codes = Object.keys(codeToZid);
console.log(`  ${codes.length} codes × ${debates.length} debates = ${codes.length * debates.length} checks`);

let bPass = 0, bFail = 0;
const failures = [];
async function testOne(slug, code, expectTopic) {
  try {
    const res = await fetch(`${BASE}/api/join/validate-code`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, code }),
    });
    const data = await res.json().catch(() => ({}));
    const okStudent = src[codeToZid[code]];
    if (res.ok && data.fullName === okStudent.fullName) { bPass++; }
    else { bFail++; failures.push(`${code}@${expectTopic}: ${res.status} ${JSON.stringify(data).slice(0, 60)}`); }
  } catch (e) { bFail++; failures.push(`${code}@${expectTopic}: ERR ${e.message}`); }
}

for (const { data, topic } of debates) {
  const slug = data.audienceJoinSlug;
  // batches of 10
  for (let i = 0; i < codes.length; i += 10) {
    await Promise.all(codes.slice(i, i + 10).map((c) => testOne(slug, c, topic)));
  }
  process.stdout.write(`  ${data.title.slice(0, 45).padEnd(46)} done\n`);
}
console.log(`\n  ${bPass}/${codes.length * debates.length} passed`);
if (bFail) { console.log(`  ✗ ${bFail} failures:`); failures.slice(0, 20).forEach((f) => console.log("     " + f)); }

/* ---------------- RESET joined/used ---------------- */
console.log("\nResetting joined/used flags to pristine state…");
for (const { doc } of debates) {
  for (const col of ["students", "joinCodes"]) {
    const snap = await doc.ref.collection(col).get();
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = db.batch();
      snap.docs.slice(i, i + 400).forEach((d) => {
        const patch = col === "students"
          ? { joined: false, joinedAt: FieldValue.delete() }
          : { used: false, joinedAt: FieldValue.delete() };
        batch.update(d.ref, patch);
      });
      await batch.commit();
    }
  }
}
// confirm pristine
let stillJoined = 0;
for (const { doc } of debates) {
  const j = (await doc.ref.collection("students").where("joined", "==", true).get()).size;
  stillJoined += j;
}
console.log(stillJoined === 0 ? "  ✓ All debates reset — 0 students marked joined." : `  ✗ ${stillJoined} still joined`);

console.log(`\n=== SUMMARY ===`);
console.log(`Part A (teams): ${aFail === 0 ? "PASS" : aFail + " FAIL"}`);
console.log(`Part B (codes): ${bFail === 0 ? "PASS — " + bPass + "/" + bPass + " codes work on every debate" : bFail + " FAIL"}`);
process.exit(aFail === 0 && bFail === 0 ? 0 : 1);
