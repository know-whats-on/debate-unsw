import type { NextRequest } from "next/server";
import { exportCsvResponse, formatTimestamp } from "@/lib/export/server";

export async function GET(req: NextRequest) {
  return exportCsvResponse(
    req,
    "digital-jury-participation.csv",
    async (debateRef) => {
      const [students, votes, comments, reactions, reflections] =
        await Promise.all([
          debateRef.collection("students").get(),
          debateRef.collection("votes").get(),
          debateRef.collection("comments").get(),
          debateRef.collection("reactions").get(),
          debateRef.collection("reflections").get(),
        ]);

      const voted = new Set(votes.docs.map((d) => d.data().studentDocId));
      const reflected = new Set(
        reflections.docs.map((d) => d.data().studentDocId ?? d.id)
      );
      const commentCount = new Map<string, number>();
      for (const d of comments.docs) {
        const id = d.data().studentDocId;
        commentCount.set(id, (commentCount.get(id) ?? 0) + 1);
      }
      const reactionCount = new Map<string, number>();
      for (const d of reactions.docs) {
        const id = d.data().studentDocId;
        reactionCount.set(id, (reactionCount.get(id) ?? 0) + 1);
      }

      return {
        headers: [
          "Student Name",
          "Student ID",
          "Email",
          "Joined",
          "Joined At",
          "Voted",
          "Comment Count",
          "Reaction Count",
          "Reflection Submitted",
        ],
        rows: students.docs
          .map((d) => {
            const s = d.data();
            return { id: d.id, data: s };
          })
          .sort((a, b) =>
            String(a.data.fullName).localeCompare(String(b.data.fullName))
          )
          .map(({ id, data: s }) => [
            s.fullName,
            s.universityStudentId,
            s.email,
            s.joined ? "Yes" : "No",
            formatTimestamp(s.joinedAt),
            voted.has(id) ? "Yes" : "No",
            commentCount.get(id) ?? 0,
            reactionCount.get(id) ?? 0,
            reflected.has(id) ? "Yes" : "No",
          ]),
      };
    }
  );
}
