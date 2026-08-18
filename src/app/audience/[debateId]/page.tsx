"use client";

import { use, useEffect, useMemo, useState } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { promptsCol, votesCol } from "@/lib/firebase/firestore";
import { useDebate } from "@/lib/debate/useDebate";
import { useDebateTimer } from "@/lib/debate/timer";
import { loadStudentSession } from "@/lib/session";
import {
  availableReflectionPrompts,
  loadAnswerCache,
} from "@/lib/debate/reflectionPrompts";
import { formatClock } from "@/lib/debate/defaults";
import type { Prompt, StudentSession, Vote } from "@/types";
import { VotePanel } from "@/components/audience/vote-panel";
import { CommentPanel } from "@/components/audience/comment-panel";
import { ReflectPanel } from "@/components/audience/reflect-panel";
import { SupportBar } from "@/components/audience/support-bar";
import { LiveBadge, Badge } from "@/components/ui/badge";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils/cn";

type Tab = "debate" | "reflect";

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: "debate", label: "Debate", icon: "🗳️" },
  { value: "reflect", label: "Reflect", icon: "📝" },
];

export default function AudienceLivePage({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = use(params);
  const { debate, rounds, loading } = useDebate(debateId);
  const timer = useDebateTimer(debate ?? null, rounds);
  const [session, setSession] = useState<StudentSession | null | undefined>(undefined);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [reflectionPrompts, setReflectionPrompts] = useState<Prompt[]>([]);
  const [tab, setTab] = useState<Tab>("debate");

  useEffect(() => {
    setSession(loadStudentSession(debateId));
  }, [debateId]);

  useEffect(() => {
    if (!session) return;
    const unsub1 = onSnapshot(votesCol(debateId), (snap) =>
      setVotes(snap.docs.map((d) => d.data()))
    );
    const unsub2 = onSnapshot(
      query(promptsCol(debateId), where("type", "==", "private_reflection_prompt")),
      (snap) => setReflectionPrompts(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [debateId, session]);

  // Jump to reflection when the debate ends
  useEffect(() => {
    if (debate?.status === "ended" && debate.reflectionsEnabled) {
      setTab("reflect");
    }
  }, [debate?.status, debate?.reflectionsEnabled]);

  // Flash the Reflect tab whenever a prompt is available and unanswered
  const reflectAlert = useMemo(() => {
    if (!debate || !session || !debate.reflectionsEnabled || tab === "reflect") {
      return false;
    }
    const cache = loadAnswerCache(debateId);
    return availableReflectionPrompts(debate, reflectionPrompts).some(
      (p) => (cache[p.responseDocId(session.studentDocId)] ?? "").trim().length < 20
    );
  }, [debate, session, reflectionPrompts, tab, debateId]);

  if (loading || session === undefined) return <FullPageSpinner />;

  if (!debate) {
    return (
      <CenteredMessage
        icon="🔍"
        title="Debate not found"
        body="Please check the link your instructor shared."
      />
    );
  }

  if (!session) {
    return (
      <CenteredMessage
        icon="🎟️"
        title="Join the debate first"
        body="Open the join link or scan the QR code your instructor shared, then enter your join code."
        action={
          <a
            href={`/join/${debate.audienceJoinSlug}`}
            className="rounded-lg bg-primary px-5 py-3 text-sm font-medium text-on-primary"
          >
            Go to join screen
          </a>
        }
      />
    );
  }

  const round = rounds.find((r) => r.index === debate.currentRoundIndex);
  /** Round entered with its clock held until the instructor starts it. */
  const armed =
    (debate.status === "live" || debate.status === "paused") &&
    !debate.currentRoundStartedAt;
  const forCount = votes.filter((v) => v.side === "for").length;
  const againstCount = votes.filter((v) => v.side === "against").length;
  const onBreak = debate.currentPhase === "break";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-xl flex-col bg-surface">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-outline-variant/40 bg-surface-container-lowest/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-center justify-between">
          <Logo />
          {debate.status === "live" ? (
            <LiveBadge />
          ) : (
            <Badge tone={debate.status === "ended" ? "neutral" : "warning"}>
              {debate.status === "paused"
                ? "Paused"
                : debate.status === "ended"
                  ? "Ended"
                  : "Starting soon"}
            </Badge>
          )}
        </div>
        <h1 className="mt-2 font-display text-lg font-bold leading-snug text-on-surface">
          {debate.title}
        </h1>
        <div className="mt-2 flex items-center justify-between gap-4">
          <p className="text-sm text-on-surface-variant">
            {debate.status === "ended"
              ? "Debate complete"
              : onBreak
                ? "☕ Break"
                : round
                  ? `Round ${round.index + 1}: ${round.title}`
                  : "Waiting to start"}
          </p>
          {debate.status !== "ended" && (armed || debate.currentRoundStartedAt) && (
            <p
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                armed
                  ? "text-on-surface-variant"
                  : timer.remaining < 30 && debate.status === "live"
                    ? "text-accent-flame"
                    : "text-primary"
              )}
              title={armed ? "Waiting for your instructor to start the timer" : undefined}
            >
              {formatClock(armed ? timer.duration : timer.remaining)}
            </p>
          )}
        </div>
        <div className="mt-3">
          <SupportBar
            forCount={forCount}
            againstCount={againstCount}
            forLabel={debate.forLabel}
            againstLabel={debate.againstLabel}
          />
        </div>
        {debate.announcement?.text &&
          Date.now() - debate.announcement.sentAt.toMillis() < 60_000 && (
            <p className="mt-3 animate-banner-in rounded-lg bg-accent-amber/20 px-3 py-2 text-sm font-medium text-on-surface">
              📣 {debate.announcement.text}
            </p>
          )}
      </header>

      {/* Panel */}
      <main className="flex-1 px-4 py-5 pb-28">
        {tab === "debate" && (
          <div className="flex flex-col gap-6">
            <VotePanel debate={debate} session={session} />
            <div className="border-t border-outline-variant/40 pt-5">
              <CommentPanel
                debate={debate}
                session={session}
                voteSide={
                  votes.find((v) => v.studentDocId === session.studentDocId)?.side
                }
              />
            </div>
          </div>
        )}
        {tab === "reflect" && <ReflectPanel debate={debate} session={session} />}
      </main>

      {/* Bottom navigation */}
      <nav
        aria-label="Participation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-outline-variant/40 bg-surface-container-lowest/95 backdrop-blur"
      >
        <div className="mx-auto grid w-full max-w-xl grid-cols-2">
          {TABS.map((item) => {
            const alert = item.value === "reflect" && reflectAlert;
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setTab(item.value)}
                aria-current={tab === item.value ? "page" : undefined}
                className={cn(
                  "flex min-h-16 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors",
                  tab === item.value
                    ? "text-primary"
                    : alert
                      ? "font-semibold text-accent-flame"
                      : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                <span
                  className={cn(
                    "relative flex h-8 w-14 items-center justify-center rounded-full text-lg transition-colors",
                    tab === item.value && "bg-primary/12",
                    alert && "animate-nav-alert bg-accent-amber/25"
                  )}
                >
                  {item.icon}
                  {alert && (
                    <>
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 animate-ping rounded-full bg-accent-flame" />
                      <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-accent-flame" />
                    </>
                  )}
                </span>
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function CenteredMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: string;
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface px-6 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="font-display text-xl font-bold text-on-surface">{title}</p>
      <p className="max-w-sm text-sm text-on-surface-variant">{body}</p>
      {action}
    </div>
  );
}
