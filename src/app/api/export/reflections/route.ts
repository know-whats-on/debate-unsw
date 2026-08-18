import type { NextRequest } from "next/server";
import { exportCsvResponse, formatTimestamp, loadRoster } from "@/lib/export/server";

export async function GET(req: NextRequest) {
  return exportCsvResponse(req, "digital-jury-reflections.csv", async (debateRef) => {
    const [snap, roster] = await Promise.all([
      debateRef.collection("reflections").get(),
      loadRoster(debateRef),
    ]);
    return {
      headers: ["Student Name", "Student ID", "Email", "Prompt", "Reflection", "Submitted At"],
      rows: snap.docs.map((d) => {
        const r = d.data();
        const student = roster.get(r.studentDocId ?? d.id);
        return [
          r.studentName,
          r.universityStudentId || student?.universityStudentId || "",
          r.email || student?.email || "",
          r.promptText ?? "",
          r.text,
          formatTimestamp(r.submittedAt),
        ];
      }),
    };
  });
}
