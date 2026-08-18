"use client";

import { useEffect, useRef, useState } from "react";
import type { Debate, Round } from "@/types";
import { useDebateTimer } from "@/lib/debate/timer";
import {
  advancePhase,
  pauseDebate,
  previousRound,
  resumeDebate,
  skipBreak,
  startDebate,
  startRoundTimer,
} from "@/lib/debate/controls";
import { formatClock } from "@/lib/debate/defaults";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

export function RoundControls({
  debate,
  rounds,
}: {
  debate: Debate;
  rounds: Round[];
}) {
  const timer = useDebateTimer(debate, rounds);
  const [confirmPrev, setConfirmPrev] = useState(false);
  const advancing = useRef(false);

  const round = rounds.find((r) => r.index === debate.currentRoundIndex);
  const onBreak = debate.currentPhase === "break";
  /** Phase entered with the clock held (timerStartsWithRound off). */
  const armed =
    debate.status !== "ended" &&
    debate.status !== "ready" &&
    debate.status !== "draft" &&
    !debate.currentRoundStartedAt;
  const isLast = debate.currentRoundIndex >= rounds.length - 1;
  const running = debate.status === "live";
  const notStarted = debate.status === "ready" || debate.status === "draft";

  // Auto-advance runs from the open admin screen (PRD §10.3); a server
  // scheduler can replace this by calling the same advancePhase transition.
  useEffect(() => {
    if (!running || !debate.autoStartRounds || advancing.current) return;
    if (!debate.currentRoundStartedAt || timer.duration === 0) return;
    if (timer.remaining > 0) return;
    advancing.current = true;
    advancePhase(debate, rounds).finally(() => {
      advancing.current = false;
    });
  }, [running, timer.remaining, timer.duration, debate, rounds]);

  if (notStarted) {
    return (
      <Card className="shadow-raised">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <Badge tone="primary">Ready to start</Badge>
          <p className="font-display text-2xl font-bold text-on-surface">
            {rounds.length} rounds ·{" "}
            {rounds[0] ? `starts with ${rounds[0].title}` : ""}
          </p>
          <Button size="lg" onClick={() => startDebate(debate, rounds)}>
            ▶ Start debate
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (debate.status === "ended") {
    return (
      <Card className="shadow-raised">
        <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
          <Badge tone="neutral">Ended</Badge>
          <p className="font-display text-2xl font-bold text-on-surface">
            Debate complete
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-raised">
      <CardContent className="flex flex-col items-center gap-5 p-8">
        <Badge
          tone={armed ? "warning" : running ? "live" : "warning"}
          className="uppercase"
        >
          {armed
            ? "Ready — timer not started"
            : running
              ? onBreak
                ? "Break — live"
                : "Live session active"
              : "Paused"}
        </Badge>

        <div className="text-center">
          <p className="text-sm text-on-surface-variant">
            {onBreak
              ? `Break after Round ${debate.currentRoundIndex + 1}`
              : round
                ? `Round ${round.index + 1} of ${rounds.length}: ${round.title}`
                : ""}
          </p>
          <p
            className={cn(
              "mt-1 font-display text-7xl font-extrabold tabular-nums tracking-tight",
              timer.remaining < 30 && running ? "text-accent-flame" : "text-primary"
            )}
            aria-live="off"
          >
            {formatClock(timer.remaining)}
          </p>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-on-surface-variant">
            {armed ? "Press start when ready" : "Remaining"}
          </p>
        </div>

        {/* progress */}
        <div className="h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-container-high">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              onBreak ? "bg-accent-amber" : "bg-primary"
            )}
            style={{ width: `${Math.min(100, timer.progress * 100)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous round"
            disabled={debate.currentRoundIndex === 0 && debate.currentPhase === "round"}
            onClick={() => setConfirmPrev(true)}
          >
            ⏮
          </Button>
          {armed ? (
            <Button
              size="lg"
              className="h-16 rounded-full px-6 text-base"
              onClick={() => startRoundTimer(debate)}
            >
              ▶ Start timer
            </Button>
          ) : (
            <Button
              size="lg"
              className="h-16 w-16 rounded-full text-2xl"
              aria-label={running ? "Pause" : "Resume"}
              onClick={() =>
                running ? pauseDebate(debate) : resumeDebate(debate)
              }
            >
              {running ? "⏸" : "▶"}
            </Button>
          )}
          <Button
            variant="outline"
            size="icon"
            aria-label={onBreak ? "Skip break" : isLast ? "Finish debate" : "Next round"}
            onClick={() =>
              onBreak ? skipBreak(debate, rounds) : advancePhase(debate, rounds)
            }
          >
            ⏭
          </Button>
        </div>

        {onBreak && (
          <Button variant="ghost" onClick={() => skipBreak(debate, rounds)}>
            Skip break → Round {debate.currentRoundIndex + 2}
          </Button>
        )}
      </CardContent>

      <ConfirmDialog
        open={confirmPrev}
        onClose={() => setConfirmPrev(false)}
        onConfirm={() => previousRound(debate, rounds)}
        title="Go back a round?"
        description="The timer restarts for the previous round. Votes and comments are kept."
        confirmLabel="Go to previous round"
      />
    </Card>
  );
}
