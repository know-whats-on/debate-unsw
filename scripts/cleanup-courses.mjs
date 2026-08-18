/**
 * Removes non-genuine (QA/test) courses and their attached classes + debates.
 * Dry-run by default; pass --execute to actually delete.
 *
 *   node scripts/cleanup-courses.mjs            # audit only
 *   node scripts/cleanup-courses.mjs --execute  # delete
 *
 * A course is KEPT if its courseCode (case-insensitive, trimmed) is in the
 * KEEP list below. As a safety net, the script refuses to delete any course
 * that is not clearly a QA/test course unless --force is also passed.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const KEEP = [
  "INFS5710",
  "CBE ROUNDTABLE",
  "TESTING",
  "DEBATE ROUNDTABLE 1",
  "INFS2604",
].map((s) => s.trim().toUpperCase());

const EXECUTE = process.argv.includes("--execute");
const FORCE = process.argv.includes("--force");

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});
const auth = getAuth();
const db = getFirestore();

const instructor = await auth.getUserByEmail("admin@debate.com");
const uid = instructor.uid;

const coursesSnap = await db
  .collection("courses")
  .where("instructorId", "==", uid)
  .get();

const keep = [];
const del = [];
for (const doc of coursesSnap.docs) {
  const code = String(doc.data().courseCode ?? "").trim().toUpperCase();
  (KEEP.includes(code) ? keep : del).push({ id: doc.id, code, ref: doc.ref });
}

// Safety: anything we're about to delete that isn't obviously a QA/test course
const looksTest = (code) => /^QA[\s-]/.test(code) || code.startsWith("QA");
const suspicious = del.filter((c) => !looksTest(c.code));

console.log(`Instructor admin@debate.com (${uid})`);
console.log(`\nKEEP (${keep.length}):`);
for (const c of keep) console.log(`  ✓ ${c.code}`);

const missing = KEEP.filter((k) => !keep.some((c) => c.code === k));
if (missing.length) {
  console.log(`\n⚠ KEEP entries NOT found as courses: ${missing.join(", ")}`);
  console.log("  (These may be a term rather than a course code, or spelled differently.)");
}

console.log(`\nDELETE (${del.length}):`);
for (const c of del) console.log(`  ✗ ${c.code}`);

if (suspicious.length && !FORCE) {
  console.log(`\n🛑 ${suspicious.length} course(s) in the delete list don't look like QA/test data:`);
  for (const c of suspicious) console.log(`     ${c.code}`);
  console.log("   Refusing to delete without --force. Review the list above.");
  process.exit(2);
}

// Count attached classes + debates for the delete set
async function attachments(courseId) {
  const [classes, debates] = await Promise.all([
    db.collection("classes").where("courseId", "==", courseId).get(),
    db.collection("debates").where("courseId", "==", courseId).get(),
  ]);
  return { classes: classes.docs, debates: debates.docs };
}

let totalClasses = 0;
let totalDebates = 0;
const plan = [];
for (const c of del) {
  const a = await attachments(c.id);
  totalClasses += a.classes.length;
  totalDebates += a.debates.length;
  plan.push({ ...c, ...a });
}
console.log(
  `\nAlso removes ${totalClasses} attached class(es) and ${totalDebates} attached debate(s) (with all their data).`
);

if (!EXECUTE) {
  console.log("\nDRY RUN — nothing deleted. Re-run with --execute to apply.");
  process.exit(0);
}

console.log("\nDeleting…");
for (const c of plan) {
  for (const debate of c.debates) {
    await db.recursiveDelete(debate.ref); // debate + all subcollections
  }
  for (const klass of c.classes) {
    await klass.ref.delete();
  }
  await c.ref.delete();
  console.log(`  removed ${c.code} (+${c.debates.length} debates, +${c.classes.length} classes)`);
}
console.log(`\nDone. Kept ${keep.length} courses, removed ${del.length}.`);
process.exit(0);
