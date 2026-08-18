import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb, verifyInstructor } from "@/lib/firebase/admin";
import { generateDebateSummary } from "@/lib/ai/claude";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const uid = await verifyInstructor(req);
  if (!uid) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { debateId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (!body.debateId) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const db = adminDb();
    const debateRef = db.collection("debates").doc(body.debateId);
    const debateSnap = await debateRef.get();
    if (!debateSnap.exists) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const debate = debateSnap.data()!;
    if (debate.instructorId !== uid) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const [rounds, comments, voteEvents, reflections] = await Promise.all([
      debateRef.collection("rounds").orderBy("index").get(),
      debateRef.collection("comments").orderBy("createdAt").get(),
      debateRef.collection("voteEvents").orderBy("createdAt").get(),
      debateRef.collection("reflections").get(),
    ]);

    const roundsText = rounds.docs
      .map((d) => {
        const r = d.data();
        return `Round ${r.index + 1}: ${r.title} (${Math.round(r.durationSeconds / 60)} min)`;
      })
      .join("\n");

    const voteTimeline = voteEvents.docs
      .map((d) => {
        const v = d.data();
        return `Round ${v.roundIndex + 1}: vote ${v.side}`;
      })
      .join("\n");

    // First names only — enough for themes without over-identifying students
    const commentsText = comments.docs
      .slice(-300)
      .map((d) => {
        const c = d.data();
        const hidden = c.status !== "visible" ? " [hidden by instructor]" : "";
        return `[Round ${c.roundIndex + 1}] (${c.side}, ${c.likeCount} likes)${hidden} ${c.studentName.split(" ")[0]}: ${c.text}`;
      })
      .join("\n");

    const reflectionsText = reflections.docs
      .slice(0, 200)
      .map((d) => {
        const r = d.data();
        const prompt = r.promptText ? ` (prompt: ${r.promptText})` : "";
        return `-${prompt} ${r.text}`;
      })
      .join("\n");

    const result = await generateDebateSummary({
      topic: debate.title,
      rounds: roundsText || "(no rounds configured)",
      voteTimeline: voteTimeline || "(no votes recorded)",
      comments: commentsText || "(no comments)",
      reflections: reflectionsText || "(no reflections submitted)",
    });

    const summaryDoc = {
      debateId: body.debateId,
      model: "claude",
      ...result,
      createdAt: FieldValue.serverTimestamp(),
    };
    const ref = await debateRef.collection("analyticsSummaries").add(summaryDoc);

    return NextResponse.json({ id: ref.id, ...result });
  } catch (err) {
    console.error("debate-summary failed", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
