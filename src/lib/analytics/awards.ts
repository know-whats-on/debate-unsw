import type { Comment, Student } from "@/types";

export interface AwardWinner {
  studentDocId: string;
  name: string;
}

export interface DebateAwards {
  topCommentors: AwardWinner[];
  topCommentorCount: number;
  mostLikedComment: { comment: Comment; authors: AwardWinner[] } | null;
  silentSupporters: AwardWinner[];
  silentSupporterLikes: number;
}

/**
 * Fun end-of-debate recognition, computed client-side from already-loaded
 * comments + roster:
 *  - Top Commentor: most comments authored (ties share the badge).
 *  - Most-Liked Comment: highest likeCount (ties list every tied author).
 *  - Silent Supporter: liked the most comments while authoring zero.
 */
export function computeDebateAwards(
  comments: Comment[],
  students: Student[]
): DebateAwards {
  const nameFor = (id: string) => students.find((s) => s.id === id)?.fullName ?? "A student";

  const commentCounts = new Map<string, number>();
  for (const c of comments) {
    commentCounts.set(c.studentDocId, (commentCounts.get(c.studentDocId) ?? 0) + 1);
  }
  const maxComments = commentCounts.size > 0 ? Math.max(...commentCounts.values()) : 0;
  const topCommentors: AwardWinner[] =
    maxComments > 0
      ? [...commentCounts.entries()]
          .filter(([, n]) => n === maxComments)
          .map(([id]) => ({ studentDocId: id, name: nameFor(id) }))
      : [];

  const maxLikes = comments.length > 0 ? Math.max(...comments.map((c) => c.likeCount)) : 0;
  const topComments = maxLikes > 0 ? comments.filter((c) => c.likeCount === maxLikes) : [];
  const mostLikedComment =
    topComments.length > 0
      ? {
          comment: topComments[0],
          authors: dedupe(
            topComments.map((c) => ({ studentDocId: c.studentDocId, name: c.studentName }))
          ),
        }
      : null;

  const likesGiven = new Map<string, number>();
  for (const c of comments) {
    for (const uid of c.likedByStudentDocIds) {
      likesGiven.set(uid, (likesGiven.get(uid) ?? 0) + 1);
    }
  }
  const candidates = [...likesGiven.entries()].filter(([uid]) => !commentCounts.get(uid));
  const maxGiven = candidates.length > 0 ? Math.max(...candidates.map(([, n]) => n)) : 0;
  const silentSupporters: AwardWinner[] =
    maxGiven > 0
      ? candidates.filter(([, n]) => n === maxGiven).map(([id]) => ({ studentDocId: id, name: nameFor(id) }))
      : [];

  return {
    topCommentors,
    topCommentorCount: maxComments,
    mostLikedComment,
    silentSupporters,
    silentSupporterLikes: maxGiven,
  };
}

function dedupe(list: AwardWinner[]): AwardWinner[] {
  const seen = new Map<string, AwardWinner>();
  for (const item of list) if (!seen.has(item.studentDocId)) seen.set(item.studentDocId, item);
  return [...seen.values()];
}

/** "Ada" · "Ada & Ben" · "Ada +2 more" */
export function formatWinners(winners: AwardWinner[]): string {
  if (winners.length === 0) return "—";
  if (winners.length === 1) return winners[0].name;
  if (winners.length === 2) return `${winners[0].name} & ${winners[1].name}`;
  return `${winners[0].name} +${winners.length - 1} more`;
}
