"use client";

import { useRef, useState } from "react";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { reactionsCol } from "@/lib/firebase/firestore";
import { REACTION_EMOJI, type Debate, type ReactionType, type StudentSession } from "@/types";
import { cn } from "@/lib/utils/cn";

const RATE_LIMIT_MS = 1500;

/** Shared rate-limited reaction sender. */
export function useSendReaction(debate: Debate, session: StudentSession) {
  const lastSent = useRef(0);
  const [pop, setPop] = useState<ReactionType | null>(null);
  const [cooldown, setCooldown] = useState(false);

  async function send(type: ReactionType) {
    if (!debate.reactionsEnabled || debate.status === "ended") return;
    const now = Date.now();
    if (now - lastSent.current < RATE_LIMIT_MS) {
      setCooldown(true);
      setTimeout(() => setCooldown(false), 600);
      return;
    }
    lastSent.current = now;
    setPop(type);
    setTimeout(() => setPop(null), 600);

    await addDoc(reactionsCol(debate.id), {
      debateId: debate.id,
      studentDocId: session.studentDocId,
      studentName: session.fullName,
      type,
      roundIndex: debate.currentRoundIndex,
      createdAt: serverTimestamp(),
    } as never);
  }

  return { send, pop, cooldown };
}

/** Compact one-row reaction strip shown under the vote cards. */
export function ReactionBar({
  debate,
  session,
}: {
  debate: Debate;
  session: StudentSession;
}) {
  const { send, pop, cooldown } = useSendReaction(debate, session);
  const disabled = !debate.reactionsEnabled || debate.status === "ended";

  return (
    <div>
      <div className="flex justify-between gap-1.5">
        {(Object.keys(REACTION_EMOJI) as ReactionType[]).map((type) => (
          <button
            key={type}
            type="button"
            disabled={disabled}
            onClick={() => send(type)}
            aria-label={`React ${REACTION_EMOJI[type]}`}
            className={cn(
              "flex h-11 flex-1 items-center justify-center rounded-full bg-surface-container text-xl transition-transform",
              "hover:bg-accent-amber/20 active:scale-90",
              "disabled:cursor-not-allowed disabled:opacity-40",
              pop === type && "animate-reaction-pop"
            )}
          >
            {REACTION_EMOJI[type]}
          </button>
        ))}
      </div>
      <p
        className={cn(
          "mt-1.5 text-center text-xs transition-colors",
          cooldown ? "font-semibold text-accent-flame" : "text-on-surface-variant"
        )}
      >
        {cooldown
          ? "Easy! One reaction every couple of seconds."
          : disabled
            ? debate.status === "ended"
              ? "The debate has ended — reactions are closed."
              : "Reactions are currently paused by your instructor."
            : "Tap to react — the whole room sees it."}
      </p>
    </div>
  );
}

