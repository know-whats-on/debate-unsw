"use client";

import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { commentsCol } from "@/lib/firebase/firestore";
import type { Comment, CommentSide, Debate, Student } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

type Filter = "all" | CommentSide;

type RoundFilter = "current" | "all" | number;

export function CommentsCard({
  debate,
  comments,
  students,
}: {
  debate: Debate;
  comments: Comment[];
  students: Student[];
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [roundFilter, setRoundFilter] = useState<RoundFilter>("current");
  const studentId = (docId: string) =>
    students.find((s) => s.id === docId)?.universityStudentId ?? "";

  // Every comment is always recorded and reachable here — the round filter is
  // just a lens (defaults to the current round so live moderation stays focused).
  const roundIndexes = Array.from(new Set(comments.map((c) => c.roundIndex))).sort(
    (a, b) => a - b
  );
  const activeRound =
    roundFilter === "current" ? debate.currentRoundIndex : roundFilter;

  const filtered = comments.filter(
    (c) =>
      (filter === "all" || c.side === filter) &&
      (roundFilter === "all" || c.roundIndex === activeRound)
  );

  async function setStatus(comment: Comment, status: Comment["status"]) {
    await updateDoc(doc(commentsCol(debate.id), comment.id), {
      status,
      updatedAt: serverTimestamp(),
    } as never);
  }

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "for", label: debate.forLabel },
    { value: "against", label: debate.againstLabel },
    { value: "neutral", label: "Neutral" },
  ];

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Live comments</CardTitle>
          <div className="flex gap-1" role="radiogroup" aria-label="Filter by side">
            {filters.map((f) => (
              <button
                key={f.value}
                type="button"
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
                  filter === f.value
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1" role="radiogroup" aria-label="Filter by round">
          {(
            [
              { value: "current" as RoundFilter, label: `This round (R${debate.currentRoundIndex + 1})` },
              ...roundIndexes
                .filter((i) => i !== debate.currentRoundIndex)
                .map((i) => ({ value: i as RoundFilter, label: `R${i + 1}` })),
              { value: "all" as RoundFilter, label: "All rounds" },
            ]
          ).map((r) => (
            <button
              key={String(r.value)}
              type="button"
              role="radio"
              aria-checked={roundFilter === r.value}
              onClick={() => setRoundFilter(r.value)}
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
                roundFilter === r.value
                  ? "bg-on-surface text-inverse-on-surface"
                  : "bg-surface-container text-on-surface-variant hover:text-on-surface"
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <EmptyState
            icon="💬"
            title="No comments yet"
            description="Once students start sharing thoughts, they will appear here live."
            className="py-8"
          />
        ) : (
          <ul className="flex max-h-105 flex-col gap-2 overflow-y-auto pr-1">
            {filtered.map((comment) => (
              <li
                key={comment.id}
                className={cn(
                  "rounded-lg border p-3",
                  comment.status === "hidden"
                    ? "border-outline-variant/40 bg-surface-container-low opacity-60"
                    : "border-outline-variant/40 bg-surface-container-lowest"
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-on-surface">
                      {comment.studentName}
                    </span>
                    {comment.anonymous && (
                      <span
                        title="Shown as Anonymous to students — you still see who wrote it"
                        className="rounded-full bg-on-surface/8 px-1.5 py-0.5 text-[10px] font-bold uppercase text-on-surface-variant"
                      >
                        🕶 Anon
                      </span>
                    )}
                    <span className="text-on-surface-variant">
                      {comment.universityStudentId || studentId(comment.studentDocId)}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                        comment.side === "for"
                          ? "bg-primary/10 text-primary"
                          : comment.side === "against"
                            ? "bg-secondary/10 text-secondary"
                            : "bg-on-surface/8 text-on-surface-variant"
                      )}
                    >
                      {comment.side}
                    </span>
                  </div>
                  <span className="text-on-surface-variant">
                    R{comment.roundIndex + 1} · {timeAgo(comment.createdAt)}
                  </span>
                </div>
                {comment.replyToName && (
                  <p className="mt-1 truncate text-xs text-on-surface-variant">
                    ↩ replying to <span className="font-semibold">{comment.replyToName}</span>
                    {comment.replyToExcerpt && `: “${comment.replyToExcerpt}”`}
                  </p>
                )}
                <p className="mt-1 text-sm text-on-surface">{comment.text}</p>
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="text-xs text-on-surface-variant">
                    ❤️ {comment.likeCount}
                    {comment.status === "hidden" && " · Hidden from room"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-7 text-xs",
                      comment.status === "visible"
                        ? "text-error hover:bg-error-container"
                        : "text-primary"
                    )}
                    onClick={() =>
                      setStatus(
                        comment,
                        comment.status === "visible" ? "hidden" : "visible"
                      )
                    }
                  >
                    {comment.status === "visible" ? "Hide" : "Unhide"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
