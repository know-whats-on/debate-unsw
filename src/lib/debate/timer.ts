"use client";

import { useEffect, useMemo, useState } from "react";
import type { Debate, Round } from "@/types";

/**
 * Timer state derived from Firestore fields (PRD §10.3).
 * All clients compute remaining time locally from the shared debate doc:
 *   currentRoundStartedAt, currentRoundPausedAt, totalPausedMs,
 *   status, currentRoundIndex, currentPhase.
 * Kept as pure functions so a server scheduler can reuse them later.
 */

export function phaseDurationSeconds(debate: Debate, rounds: Round[]): number {
  const round = rounds.find((r) => r.index === debate.currentRoundIndex);
  if (!round) return 0;
  if (debate.currentPhase === "break") {
    return round.breakDurationSeconds ?? 0;
  }
  return round.durationSeconds;
}

export function elapsedMs(debate: Debate, now: number): number {
  if (!debate.currentRoundStartedAt) return 0;
  const startedAt = debate.currentRoundStartedAt.toMillis();
  const pausedAt = debate.currentRoundPausedAt?.toMillis();
  const reference = debate.status === "paused" && pausedAt ? pausedAt : now;
  return Math.max(0, reference - startedAt - (debate.totalPausedMs ?? 0));
}

export function remainingSeconds(
  debate: Debate,
  rounds: Round[],
  now: number
): number {
  const duration = phaseDurationSeconds(debate, rounds);
  return Math.max(0, duration - elapsedMs(debate, now) / 1000);
}

/** Ticks every 250ms while the debate is live; freezes while paused. */
export function useDebateTimer(debate: Debate | null, rounds: Round[]) {
  const [now, setNow] = useState(() => Date.now());

  const running = debate?.status === "live";
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [running]);

  return useMemo(() => {
    if (!debate) {
      return { remaining: 0, duration: 0, progress: 0 };
    }
    const duration = phaseDurationSeconds(debate, rounds);
    const remaining = remainingSeconds(debate, rounds, now);
    const progress = duration > 0 ? 1 - remaining / duration : 0;
    return { remaining, duration, progress };
  }, [debate, rounds, now]);
}
