import type { NextRequest } from "next/server";
import { exportCsvResponse, formatTimestamp, loadRoster } from "@/lib/export/server";

export async function GET(req: NextRequest) {
  return exportCsvResponse(req, "digital-jury-reactions.csv", async (debateRef) => {
    const [snap, roster] = await Promise.all([
      debateRef.collection("reactions").orderBy("createdAt").get(),
      loadRoster(debateRef),
    ]);
    return {
      headers: ["Student Name", "Student ID", "Reaction", "Round", "Timestamp"],
      rows: snap.docs.map((d) => {
        const r = d.data();
        const student = roster.get(r.studentDocId);
        return [
          r.studentName,
          student?.universityStudentId ?? "",
          r.type,
          r.roundIndex + 1,
          formatTimestamp(r.createdAt),
        ];
      }),
    };
  });
}
