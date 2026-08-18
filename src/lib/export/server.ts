import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import type { DocumentReference } from "firebase-admin/firestore";
import { adminDb, verifyInstructor } from "@/lib/firebase/admin";
import { toCsv } from "@/lib/csv/exportCsv";

/**
 * Shared guard for CSV export routes: verifies the instructor token and
 * that they own the debate, then hands the debate ref to `build`.
 */
export async function exportCsvResponse(
  req: NextRequest,
  filename: string,
  build: (
    debateRef: DocumentReference
  ) => Promise<{ headers: string[]; rows: (string | number | boolean)[][] }>
) {
  const uid = await verifyInstructor(req);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const debateId = req.nextUrl.searchParams.get("debateId");
  if (!debateId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const debateRef = adminDb().collection("debates").doc(debateId);
    const debateSnap = await debateRef.get();
    if (!debateSnap.exists) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (debateSnap.data()!.instructorId !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const { headers, rows } = await build(debateRef);
    return new NextResponse("﻿" + toCsv(headers, rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error(`export ${filename} failed`, err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

export function formatTimestamp(ts?: { toDate(): Date }): string {
  return ts ? ts.toDate().toISOString() : "";
}

export interface RosterEntry {
  fullName: string;
  universityStudentId: string;
  email: string;
}

/**
 * studentDocId → identity map. Client-written docs (comments, votes,
 * reflections) deliberately omit email/student ID so publicly-readable
 * collections carry no PII; exports re-attach identity here.
 */
export async function loadRoster(
  debateRef: DocumentReference
): Promise<Map<string, RosterEntry>> {
  const snap = await debateRef.collection("students").get();
  const roster = new Map<string, RosterEntry>();
  for (const d of snap.docs) {
    const s = d.data();
    roster.set(d.id, {
      fullName: s.fullName ?? "",
      universityStudentId: s.universityStudentId ?? "",
      email: s.email ?? "",
    });
  }
  return roster;
}
