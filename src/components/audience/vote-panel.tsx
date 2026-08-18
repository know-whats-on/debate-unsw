"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { voteEventsCol, votesCol } from "@/lib/firebase/firestore";
import type { Debate, Side, StudentSession, Vote } from "@/types";
import { ReactionBar } from "./react-panel";
import { cn } from "@/lib/utils/cn";

export function VotePanel({
  debate,
  session,
}: {
  debate: Debate;
  session: StudentSession;
}) {
  const [vote, setVote] = useState<Vote | null | undefined>(undefined);
  const [justVoted, setJustVoted] = useState<Side | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(votesCol(debate.id), session.studentDocId),
      (snap) => setVote(snap.exists() ? snap.data() : null)
    );
  }, [debate.id, session.studentDocId]);

  // Per-round vote allowance. The stored roundIndex tells us whether the
  // counter belongs to the round in play; a new round starts fresh.
  const maxVotes = debate.maxVotesPerRound ?? 0;
  const limited = maxVotes > 0;
  const usedThisRound =
    vote && vote.roundIndex === debate.currentRoundIndex
      ? vote.votesThisRound ?? 1
      : 0;
  const votesLeft = limited ? Math.max(0, maxVotes - usedThisRound) : Infinity;
  const spent = limited && votesLeft <= 0;

  const votingOpen = debate.votingEnabled && debate.status !== "ended" && !spent;

  async function castVote(side: Side) {
    if (!votingOpen || vote === undefined) return;
    if (vote?.side === side) return;
    setJustVoted(side);
    setTimeout(() => setJustVoted(null), 900);

    await setDoc(doc(votesCol(debate.id), session.studentDocId), {
      debateId: debate.id,
      studentDocId: session.studentDocId,
      studentName: session.fullName,
      // Enriched from the roster in instructor exports; kept out of this
      // publicly-readable doc on purpose.
      universityStudentId: "",
      side,
      roundIndex: debate.currentRoundIndex,
      votesThisRound: usedThisRound + 1,
      ...(vote ? {} : { createdAt: serverTimestamp() }),
      updatedAt: serverTimestamp(),
    } as never, { merge: true });

    await addDoc(voteEventsCol(debate.id), {
      debateId: debate.id,
      studentDocId: session.studentDocId,
      side,
      roundIndex: debate.currentRoundIndex,
      createdAt: serverTimestamp(),
    } as never);
  }

  const sides: { side: Side; label: string; icon: string }[] = [
    { side: "for", label: debate.forLabel, icon: "👍" },
    { side: "against", label: debate.againstLabel, icon: "👎" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {!votingOpen && (
        <p className="rounded-lg bg-accent-amber/15 px-4 py-3 text-sm font-medium text-on-surface">
          {debate.status === "ended"
            ? "The debate has ended — voting is closed."
            : spent
              ? `You've used all ${maxVotes} of your votes for this round. You can vote again next round.`
              : "Voting is currently paused by your instructor."}
        </p>
      )}
      {limited && !spent && debate.status !== "ended" && (
        <p className="rounded-lg bg-primary/5 px-4 py-2 text-center text-sm font-medium text-on-surface">
          You can vote <strong>{maxVotes}</strong>{" "}
          {maxVotes === 1 ? "time" : "times"} this round ·{" "}
          <strong>{votesLeft}</strong> left
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        {sides.map(({ side, label, icon }) => {
          const selected = vote?.side === side;
          const isFor = side === "for";
          return (
            <button
              key={side}
              type="button"
              disabled={!votingOpen}
              onClick={() => castVote(side)}
              aria-pressed={selected}
              className={cn(
                "flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 p-6 transition-all",
                "disabled:cursor-not-allowed disabled:opacity-50",
                selected
                  ? isFor
                    ? "border-primary bg-primary text-on-primary shadow-raised"
                    : "border-secondary bg-secondary text-on-secondary shadow-raised"
                  : "border-outline-variant/60 bg-surface-container-lowest hover:border-primary/50",
                justVoted === side && "scale-[1.03]"
              )}
            >
              <span className={cn("text-4xl", justVoted === side && "animate-reaction-pop")}>
                {icon}
              </span>
              <span className="text-xs font-semibold uppercase tracking-widest opacity-80">
                {isFor ? "Vote" : "Vote"}
              </span>
              <span className="font-display text-xl font-bold">{label}</span>
              {selected && (
                <span className="text-xs font-medium opacity-90">✓ Your vote</span>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-center text-sm text-on-surface-variant">
        Your vote counts toward room support.
        {votingOpen &&
          (limited
            ? " Changing your vote uses one of your votes for this round."
            : " You can change it while voting is open.")}
      </p>

      {/* Quick reactions right where the action is */}
      <div className="border-t border-outline-variant/40 pt-4">
        <ReactionBar debate={debate} session={session} />
      </div>
    </div>
  );
}
