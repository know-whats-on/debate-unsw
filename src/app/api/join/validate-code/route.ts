import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";

/**
 * Validates a student's join code for a debate identified by its join slug.
 * Server-side so join codes never need to be client-readable.
 */
export async function POST(req: NextRequest) {
  let body: { slug?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const slug = (body.slug ?? "").trim();
  const code = (body.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!slug || !code) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const db = adminDb();
    const debateSnap = await db
      .collection("debates")
      .where("audienceJoinSlug", "==", slug)
      .limit(1)
      .get();

    if (debateSnap.empty) {
      return NextResponse.json({ error: "debate_not_found" }, { status: 404 });
    }
    const debateDoc = debateSnap.docs[0];
    const debate = debateDoc.data();

    if (debate.status === "draft") {
      return NextResponse.json({ error: "debate_not_ready" }, { status: 409 });
    }
    if (debate.status === "ended") {
      return NextResponse.json({ error: "debate_ended" }, { status: 409 });
    }

    const codeRef = debateDoc.ref.collection("joinCodes").doc(code);
    const codeSnap = await codeRef.get();
    if (!codeSnap.exists) {
      return NextResponse.json({ error: "invalid_code" }, { status: 404 });
    }
    const joinCode = codeSnap.data()!;

    const studentRef = debateDoc.ref
      .collection("students")
      .doc(joinCode.studentDocId);
    const studentSnap = await studentRef.get();
    if (!studentSnap.exists) {
      return NextResponse.json({ error: "invalid_code" }, { status: 404 });
    }
    const student = studentSnap.data()!;

    const now = FieldValue.serverTimestamp();
    await Promise.all([
      codeRef.update({ used: true, joinedAt: now }),
      studentRef.update({ joined: true, joinedAt: now, updatedAt: now }),
    ]);

    return NextResponse.json({
      debateId: debateDoc.id,
      studentDocId: studentSnap.id,
      joinCode: code,
      fullName: student.fullName,
    });
  } catch (err) {
    console.error("validate-code failed", err);
    // Firestore daily-quota exhaustion (gRPC code 8) — tell users honestly
    // instead of a generic failure so the instructor knows what to do.
    if ((err as { code?: number }).code === 8) {
      return NextResponse.json({ error: "service_busy" }, { status: 503 });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
