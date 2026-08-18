import type { NextRequest } from "next/server";
import { exportCsvResponse, formatTimestamp, loadRoster } from "@/lib/export/server";

export async function GET(req: NextRequest) {
  return exportCsvResponse(req, "digital-jury-comments.csv", async (debateRef) => {
    const [snap, roster] = await Promise.all([
      debateRef.collection("comments").orderBy("createdAt").get(),
      loadRoster(debateRef),
    ]);
    return {
      headers: [
        "Student Name",
        "Student ID",
        "Email",
        "Round",
        "Side",
        "Comment",
        "Likes",
        "Status",
        "Timestamp",
      ],
      rows: snap.docs.map((d) => {
        const c = d.data();
        const student = roster.get(c.studentDocId);
        return [
          c.studentName,
          c.universityStudentId || student?.universityStudentId || "",
          c.email || student?.email || "",
          c.roundIndex + 1,
          c.side,
          c.text,
          c.likeCount,
          c.status,
          formatTimestamp(c.createdAt),
        ];
      }),
    };
  });
}
