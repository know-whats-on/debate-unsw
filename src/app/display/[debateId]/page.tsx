"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import { limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import { commentsCol, votesCol } from "@/lib/firebase/firestore";
import { useDebate } from "@/lib/debate/useDebate";
import { useDebateTimer } from "@/lib/debate/timer";
import { formatClock } from "@/lib/debate/defaults";
import { commentAuthorName, type Comment, type Vote } from "@/types";
import { ReactionBubbles } from "@/components/display/reaction-bubbles";
import {
  CountdownOverlay,
  EdgeFire,
  RoundSplash,
  useDisplaySound,
} from "@/components/display/effects";
import { timeAgo } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";

export default function PublicDisplayPage({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = use(params);
  const { debate, rounds, loading } = useDebate(debateId);
  const timer = useDebateTimer(debate ?? null, rounds);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [shift, setShift] = useState<{ side: "for" | "against"; key: number } | null>(null);
  const prevLeader = useRef<"for" | "against" | null>(null);
  const sound = useDisplaySound();
  const [splash, setSplash] = useState<{ title: string; subtitle?: string; key: number } | null>(null);
  const prevPhase = useRef<string | null>(null);
  const lastTick = useRef(-1);

  useEffect(() => {
    return onSnapshot(votesCol(debateId), (snap) =>
      setVotes(snap.docs.map((d) => d.data()))
    );
  }, [debateId]);

  // Only the current round's comments — keeps the screen focused and stops
  // earlier rounds from crowding out fresh comments. Re-subscribes each round.
  const currentRoundIndex = debate?.currentRoundIndex;
  useEffect(() => {
    if (currentRoundIndex === undefined) return;
    return onSnapshot(
      query(
        commentsCol(debateId),
        where("roundIndex", "==", currentRoundIndex),
        where("status", "==", "visible"),
        orderBy("createdAt", "desc"),
        limit(30)
      ),
      (snap) => setComments(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
  }, [debateId, currentRoundIndex]);

  // Reality-TV moment: thunder-flash the screen when the lead flips
  const forVotes = votes.filter((v) => v.side === "for").length;
  const againstVotes = votes.length - forVotes;
  useEffect(() => {
    const leader =
      forVotes === againstVotes ? null : forVotes > againstVotes ? "for" : "against";
    if (leader && prevLeader.current && leader !== prevLeader.current) {
      setShift({ side: leader, key: Date.now() });
      sound.thunder();
      setTimeout(() => setShift(null), 3000);
    }
    if (leader) prevLeader.current = leader;
  }, [forVotes, againstVotes, sound]);

  // Cinematic splash + fanfare when the round/phase changes
  useEffect(() => {
    if (!debate) return;
    const phaseKey = `${debate.currentRoundIndex}:${debate.currentPhase}:${debate.status === "ended"}`;
    if (prevPhase.current && prevPhase.current !== phaseKey) {
      if (debate.status === "ended") {
        setSplash({ title: "That's a wrap!", subtitle: "The jury has spoken", key: Date.now() });
      } else if (debate.currentPhase === "break") {
        setSplash({ title: "Intermission", subtitle: "Catch your breath", key: Date.now() });
      } else {
        const round = rounds.find((r) => r.index === debate.currentRoundIndex);
        setSplash({
          title: `Round ${debate.currentRoundIndex + 1}`,
          subtitle: round?.title,
          key: Date.now(),
        });
      }
      sound.fanfare();
      setTimeout(() => setSplash(null), 2600);
    }
    prevPhase.current = phaseKey;
  }, [debate?.currentRoundIndex, debate?.currentPhase, debate?.status, debate, rounds, sound]);

  // Final-five countdown ticks
  const countdownSecond =
    debate?.status === "live" && timer.duration > 0 && timer.remaining <= 5.3 && timer.remaining > 0
      ? Math.ceil(timer.remaining)
      : null;
  useEffect(() => {
    if (countdownSecond === null) {
      lastTick.current = -1;
      return;
    }
    if (countdownSecond !== lastTick.current) {
      lastTick.current = countdownSecond;
      sound.tick(countdownSecond === 1);
    }
  }, [countdownSecond, sound]);

  // Edge fire for the last 10% of the phase
  const fireOn =
    debate?.status === "live" && timer.duration >= 60 && timer.remaining > 0 &&
    timer.remaining <= timer.duration * 0.1;
  const fireTone =
    forVotes === againstVotes ? "tie" : forVotes > againstVotes ? "for" : "against";

  // This round's comments, newest first, latest 5 per side. Scoped to the
  // round so fresh comments always show and earlier rounds don't crowd them.
  const bySide = useMemo(() => {
    const pick = (side: "for" | "against") =>
      comments
        .filter((c) => c.side === side)
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0))
        .slice(0, 5);
    return { for: pick("for"), against: pick("against") };
  }, [comments]);

  if (loading) {
    return (
      <div className="dark flex min-h-screen items-center justify-center bg-surface text-on-surface">
        <p className="animate-pulse-live font-display text-2xl">Digital Jury</p>
      </div>
    );
  }

  if (!debate) {
    return (
      <div className="dark flex min-h-screen flex-col items-center justify-center gap-3 bg-surface text-on-surface">
        <p className="text-5xl">🔍</p>
        <p className="font-display text-3xl font-bold">Debate not found</p>
      </div>
    );
  }

  const round = rounds.find((r) => r.index === debate.currentRoundIndex);
  const forCount = votes.filter((v) => v.side === "for").length;
  const againstCount = votes.length - forCount;
  const total = votes.length;
  const forPct = total === 0 ? 50 : Math.round((forCount / total) * 100);
  const againstPct = total === 0 ? 50 : 100 - forPct;
  const onBreak = debate.currentPhase === "break";
  const live = debate.status === "live" || debate.status === "paused";
  /** Round entered with its clock held until the instructor starts it. */
  const armed =
    (debate.status === "live" || debate.status === "paused") &&
    !debate.currentRoundStartedAt;
  const joinUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? (typeof window !== "undefined" ? window.location.origin : "")}/join/${debate.audienceJoinSlug}`;

  return (
    <div className="dark relative flex min-h-screen flex-col overflow-hidden bg-surface text-on-surface">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-gradient-to-b from-primary/20 to-transparent"
      />

      <ReactionBubbles debateId={debateId} />

      {fireOn && <EdgeFire tone={fireTone} />}
      {countdownSecond !== null && <CountdownOverlay second={countdownSecond} />}
      {splash && (
        <RoundSplash title={splash.title} subtitle={splash.subtitle} splashKey={splash.key} />
      )}

      {/* Momentum shift — thunder flash + banner when the lead flips */}
      {shift && (
        <div key={shift.key} aria-hidden className="pointer-events-none fixed inset-0 z-40">
          <div
            className={cn(
              "absolute inset-0 animate-lightning",
              shift.side === "for"
                ? "bg-gradient-to-b from-white via-inverse-primary/80 to-primary/60"
                : "bg-gradient-to-b from-white via-accent-amber/80 to-secondary/60"
            )}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className={cn(
                "animate-shift-banner rounded-2xl border-4 bg-surface/85 px-14 py-10 text-center shadow-overlay backdrop-blur-md",
                shift.side === "for" ? "border-inverse-primary" : "border-accent-flame"
              )}
            >
              <p className="font-display text-3xl font-black uppercase tracking-[0.3em] text-on-surface">
                ⚡ Momentum shift ⚡
              </p>
              <p
                className={cn(
                  "mt-3 font-display text-6xl font-black uppercase",
                  shift.side === "for" ? "text-inverse-primary" : "text-accent-flame"
                )}
              >
                {shift.side === "for" ? debate.forLabel : debate.againstLabel} takes the lead!
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="relative z-10 flex items-center justify-between px-10 py-6">
        <p className="font-display text-2xl font-extrabold tracking-tight">
          <span className="text-inverse-primary">Digital</span> Jury
          <span className="ml-4 text-sm font-bold uppercase tracking-[0.35em] text-accent-flame">
            Live Arena
          </span>
        </p>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={sound.toggle}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wider transition-colors",
              sound.enabled
                ? "bg-accent-amber text-on-primary-fixed"
                : "bg-surface-container-high text-on-surface-variant hover:text-on-surface"
            )}
          >
            {sound.enabled ? "🔊 Sound on" : "🔇 Sound off"}
          </button>
          {debate.status === "ended" ? (
            <span className="rounded-full bg-surface-container-high px-4 py-1.5 text-sm font-bold uppercase tracking-wider text-on-surface-variant">
              Ended
            </span>
          ) : (
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold uppercase tracking-wider",
                live ? "bg-secondary text-on-secondary" : "bg-surface-container-high text-on-surface-variant"
              )}
            >
              <span
                className={cn(
                  "h-2 w-2 rounded-full bg-white",
                  debate.status === "live" && "animate-pulse-live"
                )}
              />
              {debate.status === "paused" ? "Paused" : live ? "Live" : "Starting soon"}
            </span>
          )}
        </div>
      </header>

      {/* Announcement */}
      {debate.announcement?.text &&
        Date.now() - debate.announcement.sentAt.toMillis() < 60_000 && (
          <div className="relative z-10 mx-auto -mt-2 mb-2 animate-banner-in rounded-full bg-accent-amber px-6 py-2 font-semibold text-on-primary-fixed">
            📣 {debate.announcement.text}
          </div>
        )}

      {/* Topic + round + timer */}
      <section className="relative z-10 px-10 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-inverse-primary">
          Current resolution
        </p>
        <h1 className="mx-auto mt-2 max-w-5xl font-display text-4xl font-extrabold leading-tight lg:text-5xl">
          {debate.title}
        </h1>
        <div className="mt-4 flex items-center justify-center gap-6">
          <p className="text-lg font-medium text-on-surface-variant">
            {debate.status === "ended"
              ? "Thanks for taking part!"
              : onBreak
                ? "☕ Intermission"
                : round
                  ? `Round ${round.index + 1}: ${round.title}`
                  : "Waiting to start"}
          </p>
          {debate.status !== "ended" && (armed || debate.currentRoundStartedAt) && (
            <div className="text-center">
              <p
                className={cn(
                  "font-display text-5xl font-extrabold tabular-nums",
                  armed
                    ? "text-on-surface-variant"
                    : timer.remaining < 30 && debate.status === "live"
                      ? "text-accent-flame"
                      : "text-on-surface"
                )}
              >
                {formatClock(armed ? timer.duration : timer.remaining)}
              </p>
              {armed && (
                <p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-amber">
                  Starting shortly
                </p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Support bar */}
      <section className="relative z-10 mx-auto mt-8 w-full max-w-6xl px-10">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-inverse-primary">
              {debate.forLabel}
            </p>
            <p
              key={`for-${forPct}`}
              className="animate-reaction-pop font-display text-6xl font-extrabold text-inverse-primary"
            >
              {total > 0 ? `${forPct}%` : "—"}
            </p>
          </div>
          <p className="pb-2 text-sm font-semibold text-on-surface-variant">
            {total === 0 ? "Waiting for votes…" : `${total} votes`}
          </p>
          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-accent-flame">
              {debate.againstLabel}
            </p>
            <p
              key={`against-${againstPct}`}
              className="animate-reaction-pop font-display text-6xl font-extrabold text-accent-flame"
            >
              {total > 0 ? `${againstPct}%` : "—"}
            </p>
          </div>
        </div>
        <div className="mt-3 flex h-5 overflow-hidden rounded-full bg-surface-container-high">
          {total > 0 && (
            <>
              <div
                className="rounded-l-full bg-gradient-to-r from-primary to-tertiary-container transition-all duration-1000"
                style={{ width: `${forPct}%` }}
              />
              <div
                className="rounded-r-full bg-gradient-to-r from-accent-flame to-secondary transition-all duration-1000"
                style={{ width: `${againstPct}%` }}
              />
            </>
          )}
        </div>
      </section>

      {/* Comment columns — this round only */}
      <section className="relative z-10 mx-auto mt-10 w-full max-w-7xl flex-1 px-10 pb-32">
        <p className="mb-3 text-center text-sm font-semibold uppercase tracking-[0.3em] text-on-surface-variant">
          {debate.status === "ended"
            ? "Final round · voices of the room"
            : `Voices this round — Round ${debate.currentRoundIndex + 1}`}
        </p>
        <div className="grid grid-cols-2 gap-8">
          <CommentColumn
            heading={`Voices — ${debate.forLabel}`}
            tone="for"
            comments={debate.publicCommentsEnabled ? bySide.for : []}
          />
          <CommentColumn
            heading={`Voices — ${debate.againstLabel}`}
            tone="against"
            comments={debate.publicCommentsEnabled ? bySide.against : []}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-6 border-t border-outline-variant/30 bg-surface-container-lowest/90 px-10 py-4 backdrop-blur">
        <div className="flex items-center gap-4">
          <div className="rounded-lg bg-white p-1.5">
            <QRCodeSVG value={joinUrl} size={72} marginSize={0} />
          </div>
          <div>
            <p className="font-display text-lg font-bold">Join the debate</p>
            <p className="text-sm text-on-surface-variant">
              Scan the code, enter your join code, then vote · comment · react
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CommentColumn({
  heading,
  tone,
  comments,
}: {
  heading: string;
  tone: "for" | "against";
  comments: Comment[];
}) {
  const isFor = tone === "for";
  // Crown the current top voice of the column (3+ likes to earn it)
  const topLiked = comments.reduce(
    (best, c) => (c.likeCount >= 3 && c.likeCount > (best?.likeCount ?? 0) ? c : best),
    null as Comment | null
  );
  return (
    <div className="min-w-0">
      <h2
        className={cn(
          "mb-4 flex items-center gap-2 font-display text-xl font-bold",
          isFor ? "text-inverse-primary" : "text-accent-flame"
        )}
      >
        {isFor ? "👍" : "👎"} {heading}
      </h2>
      <div className="flex flex-col gap-3">
        {comments.length === 0 ? (
          <p className="rounded-xl border border-outline-variant/30 bg-surface-container-low/60 px-5 py-8 text-center text-on-surface-variant">
            No comments yet…
          </p>
        ) : (
          comments.map((comment) => (
            <article
              key={comment.id}
              className={cn(
                "rounded-xl border-l-4 bg-surface-container-low/80 p-4 backdrop-blur",
                isFor ? "border-primary" : "border-accent-flame",
                topLiked?.id === comment.id &&
                  "ring-2 ring-accent-amber shadow-[0_0_24px_rgba(254,200,40,0.35)]"
              )}
            >
              <div className="flex items-center justify-between text-sm">
                <span
                  className={cn(
                    "font-bold",
                    isFor ? "text-inverse-primary" : "text-accent-flame"
                  )}
                >
                  {/* No crown on anonymous comments — it would single the
                      author out on the projector. */}
                  {topLiked?.id === comment.id && !comment.anonymous && "👑 "}
                  {comment.anonymous && "🕶 "}
                  {commentAuthorName(comment)}
                </span>
                <span className="text-xs text-on-surface-variant">
                  {timeAgo(comment.createdAt)}
                </span>
              </div>
              {comment.replyToName && (
                <p className="mt-1 truncate text-sm text-on-surface-variant">
                  ↩ replying to{" "}
                  <span className="font-semibold">{comment.replyToName}</span>
                </p>
              )}
              <p className="mt-1.5 text-lg leading-snug text-on-surface">
                {comment.text}
              </p>
              {comment.likeCount > 0 && (
                <p className="mt-2 text-sm text-on-surface-variant">
                  ❤️ {comment.likeCount}
                </p>
              )}
            </article>
          ))
        )}
      </div>
    </div>
  );
}
