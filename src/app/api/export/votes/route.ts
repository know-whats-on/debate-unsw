import type { NextRequest } from "next/server";
import { exportCsvResponse, formatTimestamp, loadRoster } from "@/lib/export/server";

export async function GET(req: NextRequest) {
  return exportCsvResponse(req, "digital-jury-votes.csv", async (debateRef) => {
    const [snap, roster] = await Promise.all([
      debateRef.collection("votes").get(),
      loadRoster(debateRef),
    ]);
    return {
      headers: ["Student Name", "Student ID", "Email", "Side", "Round", "Timestamp"],
      rows: snap.docs.map((d) => {
        const v = d.data();
        const student = roster.get(v.studentDocId);
        return [
          v.studentName,
          v.universityStudentId || student?.universityStudentId || "",
          student?.email ?? "",
          v.side,
          v.roundIndex + 1,
          formatTimestamp(v.updatedAt ?? v.createdAt),
        ];
      }),
    };
  });
}
