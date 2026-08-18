"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  doc,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getDocs } from "firebase/firestore";
import { commentsCol, promptsCol } from "@/lib/firebase/firestore";
import { ANONYMOUS_NAME, commentAuthorName, publicName } from "@/types";
import type {
  Comment,
  CommentSide,
  Debate,
  Prompt,
  StudentSession,
} from "@/types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { timeAgo } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

const SIDE_STYLES: Record<CommentSide, string> = {
  for: "bg-primary/10 text-primary",
  against: "bg-secondary/10 text-secondary",
  neutral: "bg-on-surface/8 text-on-surface-variant",
};

export function CommentPanel({
  debate,
  session,
  voteSide,
}: {
  debate: Debate;
  session: StudentSession;
  /** The student's current vote — comments default to the same side. */
  voteSide?: "for" | "against";
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [busy, setBusy] = useState(false);
  const [selfAnonymous, setSelfAnonymous] = useState(false);
  const [hasPosted, setHasPosted] = useState<boolean | null>(null);

  // The student's vote decides which side (and display column) their
  // comments belong to — there is no separate side selector.
  const side: CommentSide | undefined = voteSide;

  const forcedAnonymous = debate.forceAnonymousComments === true;
  const postAsAnonymous = forcedAnonymous || selfAnonymous;
  const gated = debate.commentsGatedUntilPosted === true;

  // Whether this student has posted in the round now in play. Asked directly
  // rather than scanned off the 50-comment feed window, so a student whose
  // comment has scrolled past isn't wrongly locked out of their own round.
  useEffect(() => {
    if (!gated) {
      setHasPosted(true);
      return;
    }
    let cancelled = false;
    setHasPosted(null);
    getDocs(
      query(
        commentsCol(debate.id),
        where("roundIndex", "==", debate.currentRoundIndex),
        where("studentDocId", "==", session.studentDocId),
        limit(1)
      )
    )
      .then((snap) => !cancelled && setHasPosted(!snap.empty))
      .catch(() => !cancelled && setHasPosted(false));
    return () => {
      cancelled = true;
    };
  }, [gated, debate.id, debate.currentRoundIndex, session.studentDocId]);

  // Only the current round's comments — keeps the feed focused on the round
  // students are debating. Re-subscribes when the round advances.
  useEffect(() => {
    return onSnapshot(
      query(
        commentsCol(debate.id),
        where("roundIndex", "==", debate.currentRoundIndex),
        where("status", "==", "visible"),
        orderBy("createdAt", "desc"),
        limit(50)
      ),
      (snap) => setComments(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
  }, [debate.id, debate.currentRoundIndex]);

  useEffect(() => {
    return onSnapshot(
      query(promptsCol(debate.id), where("type", "==", "public_guiding_question")),
      (snap) => setPrompts(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
  }, [debate.id]);

  // Only this round's questions (plus whole-debate ones) — a previous
  // round's questions never linger into the next round.
  const guidingQuestions = useMemo(
    () =>
      [...prompts]
        .filter(
          (p) =>
            p.roundIndex === undefined ||
            p.roundIndex === null ||
            p.roundIndex === debate.currentRoundIndex
        )
        .sort((a, b) => a.order - b.order),
    [prompts, debate.currentRoundIndex]
  );

  // Group replies under their root comment (replies-to-replies join the same
  // thread; replies whose parent fell outside the feed window stand alone).
  const threads = useMemo(() => {
    const byId = new Map(comments.map((c) => [c.id, c]));
    const rootOf = (comment: Comment): Comment => {
      let current = comment;
      const visited = new Set<string>();
      while (
        current.replyToCommentId &&
        byId.has(current.replyToCommentId) &&
        !visited.has(current.id)
      ) {
        visited.add(current.id);
        current = byId.get(current.replyToCommentId)!;
      }
      return current;
    };
    const replyMap = new Map<string, Comment[]>();
    const roots: Comment[] = [];
    for (const comment of comments) {
      if (comment.replyToCommentId && byId.has(comment.replyToCommentId)) {
        const root = rootOf(comment);
        replyMap.set(root.id, [...(replyMap.get(root.id) ?? []), comment]);
      } else {
        roots.push(comment);
      }
    }
    return roots.map((root) => ({
      root,
      replies: (replyMap.get(root.id) ?? []).sort(
        (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)
      ),
    }));
  }, [comments]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || !debate.commentsEnabled || !side) return;
    setBusy(true);
    try {
      await addDoc(commentsCol(debate.id), {
        debateId: debate.id,
        roundIndex: debate.currentRoundIndex,
        studentDocId: session.studentDocId,
        studentName: session.fullName,
        // Enriched from the roster in instructor exports; kept out of this
        // publicly-readable doc on purpose.
        universityStudentId: "",
        email: "",
        side,
        text: text.trim().slice(0, 500),
        ...(postAsAnonymous ? { anonymous: true } : {}),
        ...(replyTo
          ? {
              replyToCommentId: replyTo.id,
              // Use the same display rule as the feed, or replying would
              // leak an anonymous author's name into the quote.
              replyToName: commentAuthorName(replyTo),
              replyToExcerpt: replyTo.text.slice(0, 80),
            }
          : {}),
        likeCount: 0,
        likedByStudentDocIds: [],
        status: "visible",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as never);
      setText("");
      setReplyTo(null);
      setSelfAnonymous(false);
      setHasPosted(true);
    } finally {
      setBusy(false);
    }
  }

  // Per-round like allowance — counted from this round's feed, so un-liking
  // frees a slot back up.
  const maxLikes = debate.maxLikesPerRound ?? 0;
  const likesLimited = maxLikes > 0;
  const likesUsed = comments.filter((c) =>
    c.likedByStudentDocIds.includes(session.studentDocId)
  ).length;
  const likesSpent = likesLimited && likesUsed >= maxLikes;

  async function toggleLike(comment: Comment) {
    const liked = comment.likedByStudentDocIds.includes(session.studentDocId);
    if (!liked && likesSpent) return;
    await updateDoc(doc(commentsCol(debate.id), comment.id), {
      likeCount: increment(liked ? -1 : 1),
      likedByStudentDocIds: liked
        ? arrayRemove(session.studentDocId)
        : arrayUnion(session.studentDocId),
    } as never);
  }

  return (
    <div className="flex flex-col gap-4">
      {debate.commentsEnabled ? (
        <form onSubmit={submit} className="flex flex-col gap-3">
          {guidingQuestions.length > 0 && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-primary">
                {guidingQuestions.length === 1 ? "Guiding question" : "Guiding questions"}
              </p>
              <ul className="mt-0.5 flex flex-col gap-1">
                {guidingQuestions.map((q) => (
                  <li key={q.id} className="text-sm text-on-surface">
                    {guidingQuestions.length > 1 && "• "}
                    {q.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {replyTo && (
            <div className="flex items-center justify-between gap-2 rounded-lg border-l-4 border-primary bg-primary/5 px-3 py-2">
              <p className="min-w-0 truncate text-sm text-on-surface-variant">
                ↩ Replying to{" "}
                <span className="font-semibold text-on-surface">
                  {commentAuthorName(replyTo)}
                </span>
                : “{replyTo.text.slice(0, 60)}
                {replyTo.text.length > 60 ? "…" : ""}”
              </p>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={() => setReplyTo(null)}
                className="shrink-0 rounded-full px-2 py-0.5 text-sm font-bold text-on-surface-variant hover:bg-surface-container"
              >
                ✕
              </button>
            </div>
          )}
          {side ? (
            <>
              <div className="flex items-end gap-2">
                <Textarea
                  aria-label="Your comment"
                  rows={2}
                  maxLength={500}
                  placeholder="Add your argument…"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <Button type="submit" disabled={busy || !text.trim()} className="shrink-0">
                  Send
                </Button>
              </div>

              {forcedAnonymous ? (
                <p className="rounded-lg bg-surface-container px-3 py-2 text-xs font-medium text-on-surface">
                  🕶 Your instructor has made all comments anonymous — other
                  students won&apos;t see who wrote this.
                </p>
              ) : (
                <label className="flex items-center gap-2 text-xs text-on-surface">
                  <input
                    type="checkbox"
                    checked={selfAnonymous}
                    onChange={(e) => setSelfAnonymous(e.target.checked)}
                    className="h-4 w-4 accent-[var(--primary)]"
                  />
                  Post anonymously — hide my name from other students
                </label>
              )}

              <p className="text-xs text-on-surface-variant">
                Commenting as “
                {postAsAnonymous ? ANONYMOUS_NAME : publicName(session.fullName)}
                ” on the{" "}
                <span
                  className={cn(
                    "font-semibold",
                    side === "for" ? "text-primary" : "text-secondary"
                  )}
                >
                  {side === "for" ? debate.forLabel : debate.againstLabel}
                </span>{" "}
                side — your vote decides which column your comment joins.
                {postAsAnonymous && " Your instructor can still see it's you."}
              </p>
            </>
          ) : (
            <p className="rounded-lg bg-primary/5 px-4 py-3 text-sm font-medium text-on-surface">
              🗳️ Cast your vote above to join the conversation — your comments
              go to the column of the side you vote for.
            </p>
          )}
        </form>
      ) : (
        <p className="rounded-lg bg-accent-amber/15 px-4 py-3 text-sm font-medium text-on-surface">
          Comments are currently paused by your instructor.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
          This round&apos;s comments
        </p>
        {likesLimited && hasPosted !== false && (
          <p
            className={cn(
              "text-xs font-medium",
              likesSpent ? "text-accent-flame" : "text-on-surface-variant"
            )}
          >
            {likesUsed} of {maxLikes} likes used this round
          </p>
        )}
      </div>

      {hasPosted === false ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-6 py-10 text-center">
          <span className="text-3xl">✍️</span>
          <p className="font-display font-semibold text-on-surface">
            Share your thoughts first
          </p>
          <p className="max-w-sm text-sm text-on-surface-variant">
            Post a comment above to see what everyone else is saying this round.
          </p>
        </div>
      ) : hasPosted === null ? (
        <p className="py-8 text-center text-sm text-on-surface-variant">
          Loading this round&apos;s comments…
        </p>
      ) : comments.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No comments yet this round"
          description="Comments from this round appear here live. Each round starts a fresh conversation."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {threads.map(({ root, replies }) => (
            <li
              key={root.id}
              className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-4"
            >
              <CommentBody comment={root} />
              {replies.length > 0 && (
                <ul className="mt-3 flex flex-col gap-2 border-l-2 border-primary/25 pl-3">
                  {replies.map((reply) => (
                    <li
                      key={reply.id}
                      className="rounded-lg bg-surface-container-low/70 p-3"
                    >
                      <CommentBody comment={reply} isReply />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  function CommentBody({
    comment,
    isReply = false,
  }: {
    comment: Comment;
    isReply?: boolean;
  }) {
    const liked = comment.likedByStudentDocIds.includes(session.studentDocId);
    return (
      <>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isReply && <span aria-hidden className="text-xs text-primary">↳</span>}
            <span
              className={cn(
                "text-sm font-semibold",
                comment.anonymous ? "text-on-surface-variant italic" : "text-on-surface"
              )}
            >
              {comment.anonymous && "🕶 "}
              {commentAuthorName(comment)}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                SIDE_STYLES[comment.side]
              )}
            >
              {comment.side === "for"
                ? debate.forLabel
                : comment.side === "against"
                  ? debate.againstLabel
                  : "Neutral"}
            </span>
          </div>
          <span className="text-xs text-on-surface-variant">
            {timeAgo(comment.createdAt)}
          </span>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-on-surface">
          {comment.text}
        </p>
        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleLike(comment)}
            aria-pressed={liked}
            disabled={!liked && likesSpent}
            title={
              !liked && likesSpent
                ? `You've used all ${maxLikes} of your likes this round`
                : undefined
            }
            aria-label={liked ? "Unlike comment" : "Like comment"}
            className={cn(
              "inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-sm font-medium transition-colors",
              liked
                ? "bg-secondary/10 text-secondary"
                : "text-on-surface-variant hover:bg-surface-container",
              !liked && likesSpent && "cursor-not-allowed opacity-40"
            )}
          >
            {liked ? "❤️" : "🤍"} {comment.likeCount > 0 && comment.likeCount}
          </button>
          {debate.commentsEnabled && side && (
            <button
              type="button"
              onClick={() => {
                setReplyTo(comment);
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-sm font-medium text-on-surface-variant transition-colors hover:bg-surface-container"
            >
              💬 Reply
            </button>
          )}
        </div>
      </>
    );
  }
}
