import { NextResponse, type NextRequest } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { adminDb, verifyInstructor } from "@/lib/firebase/admin";

/**
 * Complete debate dataset as JSON for review and research: debate metadata,
 * rounds, roster, votes, the full vote-event trail, comments (including
 * hidden and replies), reactions, reflections and AI summaries.
 * Instructor-only.
 */
export async function GET(req: NextRequest) {
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

    const collect = async (name: string, orderField?: string) => {
      let query: FirebaseFirestore.Query = debateRef.collection(name);
      if (orderField) query = query.orderBy(orderField);
      const snap = await query.get();
      return snap.docs.map((d) => ({ id: d.id, ...serialize(d.data()) }));
    };

    const [rounds, students, votes, voteEvents, comments, reactions, reflections, aiSummaries] =
      await Promise.all([
        collect("rounds", "index"),
        collect("students"),
        collect("votes"),
        collect("voteEvents", "createdAt"),
        collect("comments", "createdAt"),
        collect("reactions", "createdAt"),
        collect("reflections"),
        collect("analyticsSummaries", "createdAt"),
      ]);

    const dataset = {
      exportedAt: new Date().toISOString(),
      debate: { id: debateSnap.id, ...serialize(debateSnap.data()!) },
      rounds,
      students,
      votes,
      voteEvents,
      comments,
      reactions,
      reflections,
      aiSummaries,
    };

    return new NextResponse(JSON.stringify(dataset, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="digital-jury-research-dataset.json"',
      },
    });
  } catch (err) {
    console.error("research export failed", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}

/** Recursively converts Firestore Timestamps to ISO strings. */
function serialize(value: unknown): Record<string, unknown> {
  return convert(value) as Record<string, unknown>;
}

function convert(value: unknown): unknown {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, convert(v)])
    );
  }
  return value;
}
