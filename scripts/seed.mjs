/**
 * Seeds the instructor account (and optional demo data) via the Admin SDK.
 *
 *   node scripts/seed.mjs --email you@uni.edu --password "..." [--demo]
 *
 * Reads Firebase Admin credentials from .env.local.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

// --- minimal .env.local loader (no extra deps) ---
const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
for (const line of envFile.split("\n")) {
  const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) {
    process.env[match[1]] = match[2].replace(/^"|"$/g, "");
  }
}

const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}
const email = arg("email", "instructor@digitaljury.test");
const password = arg("password", "DigitalJury2026!");
const withDemo = args.includes("--demo");

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }),
});

const auth = getAuth();
const db = getFirestore();

// --- instructor account ---
let user;
try {
  user = await auth.getUserByEmail(email);
  await auth.updateUser(user.uid, { password });
  console.log(`Updated password for existing instructor ${email}`);
} catch {
  user = await auth.createUser({ email, password, displayName: "Instructor" });
  console.log(`Created instructor ${email}`);
}

await db.collection("users").doc(user.uid).set(
  {
    id: user.uid,
    email,
    displayName: "Instructor",
    role: "instructor",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  },
  { merge: true }
);
console.log(`users/${user.uid} written`);

// --- optional demo data ---
if (withDemo) {
  const now = FieldValue.serverTimestamp();
  const course = await db.collection("courses").add({
    instructorId: user.uid,
    courseCode: "INFS5704",
    courseName: "Information Systems Research",
    term: "Semester 2, 2026",
    createdAt: now,
    updatedAt: now,
  });
  const klass = await db.collection("classes").add({
    courseId: course.id,
    instructorId: user.uid,
    className: "Tuesday 2 PM",
    location: "Room 302",
    timezone: "Australia/Sydney",
    createdAt: now,
    updatedAt: now,
  });
  const debate = await db.collection("debates").add({
    courseId: course.id,
    classId: klass.id,
    instructorId: user.uid,
    title: "Should AI be banned at Unis?",
    description: "",
    forLabel: "For",
    againstLabel: "Against",
    status: "ready",
    currentRoundIndex: 0,
    currentPhase: "round",
    totalPausedMs: 0,
    audienceJoinSlug: "demo" + Math.random().toString(36).slice(2, 6),
    displaySlug: Math.random().toString(36).slice(2, 10),
    votingEnabled: true,
    commentsEnabled: true,
    reactionsEnabled: true,
    reflectionsEnabled: true,
    publicCommentsEnabled: true,
    autoStartRounds: true,
    setupStep: 8,
    createdAt: now,
    updatedAt: now,
  });

  const ROUNDS = [
    ["Opening Statements", 240, true, 60],
    ["Rebuttal", 300, true, 60],
    ["Cross Examination", 300, true, 120],
    ["Closing Arguments", 240, false, 60],
    ["Final Summary", 180, false, 60],
  ];
  for (const [i, [title, duration, breakAfter, breakDuration]] of ROUNDS.entries()) {
    await debate.collection("rounds").add({
      debateId: debate.id,
      index: i,
      title,
      durationSeconds: duration,
      breakAfterEnabled: breakAfter,
      breakDurationSeconds: breakDuration,
      status: "not_started",
    });
  }

  const STUDENTS = [
    ["Emma", "Lawson", "z5551001"],
    ["Liam", "Chen", "z5551002"],
    ["Sofia", "Nguyen", "z5551003"],
    ["Noah", "Patel", "z5551004"],
    ["Ava", "Kaur", "z5551005"],
    ["Oliver", "Smith", "z5551006"],
  ];
  const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const usedCodes = new Set();
  const genCode = () => {
    let code;
    do {
      code = Array.from({ length: 6 }, () =>
        ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
      ).join("");
    } while (usedCodes.has(code));
    usedCodes.add(code);
    return code;
  };

  for (const [first, last, sid] of STUDENTS) {
    const code = genCode();
    const student = await debate.collection("students").add({
      debateId: debate.id,
      firstName: first,
      lastName: last,
      fullName: `${first} ${last}`,
      universityStudentId: sid,
      email: `${first.toLowerCase()}.${last.toLowerCase()}@student.test.edu`,
      joinCode: code,
      joined: false,
      assignedSide: "audience",
      createdAt: now,
      updatedAt: now,
    });
    await debate.collection("joinCodes").doc(code).set({
      joinCode: code,
      debateId: debate.id,
      studentDocId: student.id,
      used: false,
      createdAt: now,
    });
    console.log(`  ${first} ${last}: ${code}`);
  }

  const snap = await debate.get();
  console.log(`\nDemo debate ready: ${debate.id}`);
  console.log(`Join URL: /join/${snap.data().audienceJoinSlug}`);
  console.log(`Display URL: /display/${debate.id}`);
}

console.log("\nSeed complete.");
