import type { Comment, Student } from "@/types";
import { computeDebateAwards, formatWinners } from "@/lib/analytics/awards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

const TONE_CLASSES = {
  primary: "border-primary/30 bg-primary/5",
  secondary: "border-secondary/30 bg-secondary/5",
  amber: "border-accent-amber/40 bg-accent-amber/10",
} as const;

export function DebateAwardsCard({
  comments,
  students,
}: {
  comments: Comment[];
  students: Student[];
}) {
  const awards = computeDebateAwards(comments, students);
  const hasAny =
    awards.topCommentors.length > 0 ||
    !!awards.mostLikedComment ||
    awards.silentSupporters.length > 0;

  return (
    <Card className="border-accent-amber/40 bg-gradient-to-br from-accent-amber/5 via-transparent to-primary/5">
      <CardHeader>
        <CardTitle>🏆 Debate Awards</CardTitle>
        <CardDescription>A little recognition for the room&rsquo;s MVPs.</CardDescription>
      </CardHeader>
      <CardContent>
        {!hasAny ? (
          <p className="py-6 text-center text-sm text-on-surface-variant">
            No awards yet — they appear once students start commenting and liking.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <AwardTile
              emoji="📣"
              title="Top Commentor"
              name={formatWinners(awards.topCommentors)}
              detail={
                awards.topCommentors.length > 0
                  ? `${awards.topCommentorCount} comment${awards.topCommentorCount === 1 ? "" : "s"}`
                  : "No comments yet"
              }
              tone="primary"
            />
            <AwardTile
              emoji="❤️"
              title="Most-Liked Comment"
              name={awards.mostLikedComment ? formatWinners(awards.mostLikedComment.authors) : "—"}
              detail={
                awards.mostLikedComment
                  ? `${awards.mostLikedComment.comment.likeCount} like${awards.mostLikedComment.comment.likeCount === 1 ? "" : "s"}`
                  : "No likes yet"
              }
              quote={awards.mostLikedComment?.comment.text}
              tone="secondary"
            />
            <AwardTile
              emoji="🤫"
              title="Silent Supporter"
              name={formatWinners(awards.silentSupporters)}
              detail={
                awards.silentSupporters.length > 0
                  ? `${awards.silentSupporterLikes} like${awards.silentSupporterLikes === 1 ? "" : "s"} given · 0 comments`
                  : "Everyone spoke up!"
              }
              tone="amber"
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AwardTile({
  emoji,
  title,
  name,
  detail,
  quote,
  tone,
}: {
  emoji: string;
  title: string;
  name: string;
  detail: string;
  quote?: string;
  tone: keyof typeof TONE_CLASSES;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1.5 rounded-xl border p-5 text-center",
        TONE_CLASSES[tone]
      )}
    >
      <span className="animate-reaction-pop text-4xl">{emoji}</span>
      <p className="font-display text-xs font-bold uppercase tracking-wide text-on-surface-variant">
        {title}
      </p>
      <p className="font-display text-lg font-extrabold text-on-surface">{name}</p>
      <p className="text-xs text-on-surface-variant">{detail}</p>
      {quote && (
        <p className="mt-1 line-clamp-2 text-xs italic text-on-surface-variant">
          &ldquo;{quote}&rdquo;
        </p>
      )}
    </div>
  );
}
