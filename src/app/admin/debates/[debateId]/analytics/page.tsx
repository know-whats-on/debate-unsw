"use client";

import { use, useEffect, useMemo, useState } from "react";
import { doc, getDoc, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import {
  analyticsSummariesCol,
  commentsCol,
  reactionsCol,
  reflectionsCol,
  studentsCol,
  voteEventsCol,
  votesCol,
} from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useDebate } from "@/lib/debate/useDebate";
import { useAuthedFetch } from "@/components/auth-provider";
import type {
  AnalyticsSummary,
  Comment,
  Reaction,
  Reflection,
  Student,
  Vote,
  VoteEvent,
} from "@/types";
import { VoteTimelineChart } from "@/components/analytics/vote-timeline-chart";
import { AiSummaryCard } from "@/components/analytics/ai-summary-card";
import { DebateAwardsCard } from "@/components/analytics/debate-awards-card";
import { DebateStatusBadge } from "@/components/admin/debate-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FullPageSpinner } from "@/components/ui/spinner";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils/cn";

export default function AnalyticsPage({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = use(params);
  const { debate, rounds, loading } = useDebate(debateId);
  const authedFetch = useAuthedFetch();
  const [students, setStudents] = useState<Student[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [voteEvents, setVoteEvents] = useState<VoteEvent[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [courseCode, setCourseCode] = useState("");
  const [className, setClassName] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);

  useEffect(() => {
    const unsubs = [
      onSnapshot(studentsCol(debateId), (s) =>
        setStudents(s.docs.map((d) => ({ ...d.data(), id: d.id })))
      ),
      onSnapshot(votesCol(debateId), (s) => setVotes(s.docs.map((d) => d.data()))),
      onSnapshot(voteEventsCol(debateId), (s) =>
        setVoteEvents(s.docs.map((d) => d.data()))
      ),
      onSnapshot(commentsCol(debateId), (s) =>
        setComments(s.docs.map((d) => ({ ...d.data(), id: d.id })))
      ),
      onSnapshot(reactionsCol(debateId), (s) =>
        setReactions(s.docs.map((d) => ({ ...d.data(), id: d.id })))
      ),
      onSnapshot(reflectionsCol(debateId), (s) =>
        setReflections(s.docs.map((d) => d.data()))
      ),
      onSnapshot(
        query(analyticsSummariesCol(debateId), orderBy("createdAt", "desc"), limit(1)),
        (s) =>
          setSummary(s.empty ? null : { ...s.docs[0].data(), id: s.docs[0].id } as AnalyticsSummary)
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [debateId]);

  useEffect(() => {
    if (!debate) return;
    if (debate.courseId) {
      getDoc(doc(db(), "courses", debate.courseId)).then(
        (snap) => snap.exists() && setCourseCode(snap.data().courseCode ?? "")
      );
    }
    if (debate.classId) {
      getDoc(doc(db(), "classes", debate.classId)).then(
        (snap) => snap.exists() && setClassName(snap.data().className ?? "")
      );
    }
  }, [debate?.courseId, debate?.classId, debate]);

  const joined = students.filter((s) => s.joined).length;
  // A student may answer several prompts — completion counts distinct students
  const reflectingStudents = new Set(reflections.map((r) => r.studentDocId)).size;
  const reflectionPct =
    joined === 0 ? 0 : Math.round((reflectingStudents / joined) * 100);

  const topComments = useMemo(
    () =>
      [...comments]
        .filter((c) => c.status === "visible")
        .sort((a, b) => b.likeCount - a.likeCount)
        .slice(0, 5),
    [comments]
  );

  const mostActive = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const c of comments) {
      const entry = counts.get(c.studentDocId) ?? { name: c.studentName, count: 0 };
      entry.count++;
      counts.set(c.studentDocId, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  }, [comments]);

  async function download(
    kind:
      | "comments"
      | "reflections"
      | "votes"
      | "participation"
      | "reactions"
      | "research"
  ) {
    setExportError(null);
    try {
      const res = await authedFetch(`/api/export/${kind}?debateId=${debateId}`);
      if (!res.ok) throw new Error("export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        kind === "research"
          ? "digital-jury-research-dataset.json"
          : `digital-jury-${kind}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Export failed. Please try again.");
    }
  }

  async function downloadPdf() {
    if (!debate) return;
    setExportError(null);
    setPdfBusy(true);
    try {
      const { downloadDebateReportPdf } = await import("@/lib/reports/debateReportPdf");
      await downloadDebateReportPdf({
        debate,
        courseCode,
        className,
        rounds,
        students,
        votes,
        voteEvents,
        comments,
        reactions,
        reflections,
        summary,
      });
    } catch {
      setExportError("We could not build the PDF report. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) return <FullPageSpinner />;
  if (!debate) {
    return <EmptyState icon="🔍" title="Debate not found" description="This debate may have been deleted." />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <DebateStatusBadge status={debate.status} />
            <span className="text-sm text-on-surface-variant">Post-debate analytics</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold text-on-surface">
            {debate.title}
          </h1>
        </div>
      </div>

      {debate.status !== "ended" && (
        <p className="rounded-lg bg-accent-amber/15 px-4 py-3 text-sm font-medium text-on-surface">
          This debate has not ended yet — numbers below are still moving.
        </p>
      )}

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="Audience joined" value={joined} sub={`of ${students.length}`} />
        <SummaryCard label="Votes cast" value={votes.length} sub={`${voteEvents.length} changes`} />
        <SummaryCard label="Comments" value={comments.length} sub={`${comments.filter((c) => c.status === "hidden").length} hidden · ${comments.filter((c) => c.status === "flagged").length} flagged`} />
        <SummaryCard label="Reactions" value={reactions.length} />
        <SummaryCard label="Reflections" value={`${reflectionPct}%`} sub={`${reflections.length} responses · ${reflectingStudents} students`} />
      </div>

      {debate.status === "ended" && (
        <DebateAwardsCard comments={comments} students={students} />
      )}

      {/* Vote over time */}
      <Card>
        <CardHeader>
          <CardTitle>Support over time</CardTitle>
          <CardDescription>
            Every vote and vote change, replayed across the debate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <VoteTimelineChart debate={debate} voteEvents={voteEvents} />
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        {/* Top comments */}
        <Card>
          <CardHeader>
            <CardTitle>Top-liked comments</CardTitle>
          </CardHeader>
          <CardContent>
            {topComments.length === 0 ? (
              <p className="py-6 text-center text-sm text-on-surface-variant">
                No comments were posted.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {topComments.map((comment) => (
                  <li
                    key={comment.id}
                    className="rounded-lg border border-outline-variant/40 p-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-on-surface">
                        {comment.studentName}
                        <span
                          className={cn(
                            "ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase",
                            comment.side === "for"
                              ? "bg-primary/10 text-primary"
                              : comment.side === "against"
                                ? "bg-secondary/10 text-secondary"
                                : "bg-on-surface/8 text-on-surface-variant"
                          )}
                        >
                          {comment.side}
                        </span>
                      </span>
                      <span className="font-semibold text-secondary">
                        ❤️ {comment.likeCount}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-on-surface">{comment.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Engagement breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Engagement breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-sm font-medium text-on-surface">Comments by side</p>
              <div className="flex gap-2 text-sm">
                {(["for", "against", "neutral"] as const).map((side) => (
                  <span
                    key={side}
                    className="rounded-full bg-surface-container px-3 py-1 font-medium text-on-surface"
                  >
                    {side === "for"
                      ? debate.forLabel
                      : side === "against"
                        ? debate.againstLabel
                        : "Neutral"}
                    : {comments.filter((c) => c.side === side).length}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-on-surface">Comments by round</p>
              <div className="flex flex-wrap gap-2 text-sm">
                {rounds.map((round) => (
                  <span
                    key={round.id}
                    className="rounded-full bg-surface-container px-3 py-1 font-medium text-on-surface"
                  >
                    R{round.index + 1}: {comments.filter((c) => c.roundIndex === round.index).length}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-medium text-on-surface">Most active students</p>
              {mostActive.length === 0 ? (
                <p className="text-sm text-on-surface-variant">No comments yet.</p>
              ) : (
                <ol className="flex flex-col gap-1 text-sm">
                  {mostActive.map((entry, i) => (
                    <li key={entry.name} className="flex justify-between">
                      <span className="text-on-surface">
                        {i + 1}. {entry.name}
                      </span>
                      <span className="text-on-surface-variant">
                        {entry.count} comments
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reflections */}
      <Card>
        <CardHeader>
          <CardTitle>Reflection insights</CardTitle>
          <CardDescription>
            {reflections.length} responses from {reflectingStudents} students ·{" "}
            {reflectionPct}% of joined students. Reflections are private to you
            and never shown publicly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {reflections.length === 0 ? (
            <p className="py-6 text-center text-sm text-on-surface-variant">
              No reflections submitted yet.
            </p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {reflections.slice(0, 6).map((reflection, i) => (
                <li
                  key={`${reflection.studentDocId}-${reflection.promptId ?? i}`}
                  className="rounded-lg bg-surface-container-low p-4"
                >
                  {reflection.promptText && (
                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
                      {reflection.promptText}
                    </p>
                  )}
                  <p className="text-sm italic leading-relaxed text-on-surface">
                    “{reflection.text}”
                  </p>
                  <p className="mt-2 text-xs font-medium text-on-surface-variant">
                    — {reflection.studentName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* AI summary */}
      <AiSummaryCard debateId={debateId} summary={summary} />

      {/* Exports */}
      <Card>
        <CardHeader>
          <CardTitle>Export data</CardTitle>
          <CardDescription>
            CSVs include identifiable student data for educational use — handle
            per your institution’s policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
            <div className="flex-1">
              <p className="font-display font-semibold text-on-surface">
                📄 Instructor report (PDF)
              </p>
              <p className="text-sm text-on-surface-variant">
                A print-ready report — overview, awards, engagement charts,
                top voices, reflections and the AI summary, one section per page.
              </p>
            </div>
            <Button onClick={downloadPdf} disabled={pdfBusy}>
              {pdfBusy ? (
                <>
                  <Spinner className="h-4 w-4 border-on-primary/40 border-t-on-primary" />
                  Building…
                </>
              ) : (
                "Download PDF report"
              )}
            </Button>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => download("comments")}>⬇ Comments CSV</Button>
            <Button variant="outline" onClick={() => download("reflections")}>⬇ Reflections CSV</Button>
            <Button variant="outline" onClick={() => download("votes")}>⬇ Votes CSV</Button>
            <Button variant="outline" onClick={() => download("reactions")}>⬇ Reactions CSV</Button>
            <Button variant="outline" onClick={() => download("participation")}>⬇ Participation CSV</Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-outline-variant/50 bg-surface-container-low p-4">
            <div className="flex-1">
              <p className="font-display font-semibold text-on-surface">
                🔬 Research dataset (JSON)
              </p>
              <p className="text-sm text-on-surface-variant">
                The complete raw dataset — debate settings, rounds, roster,
                every vote and vote change, all comments (including hidden and
                replies), reactions, reflections and AI summaries — for review
                and research.
              </p>
            </div>
            <Button variant="outline" onClick={() => download("research")}>
              ⬇ Download dataset
            </Button>
          </div>
          {exportError && (
            <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
              {exportError}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-5">
      <p className="text-sm text-on-surface-variant">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold text-primary">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-on-surface-variant">{sub}</p>}
    </div>
  );
}
