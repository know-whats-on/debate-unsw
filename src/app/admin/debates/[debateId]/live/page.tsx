"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
  commentsCol,
  reactionsCol,
  studentsCol,
  votesCol,
} from "@/lib/firebase/firestore";
import { useDebate } from "@/lib/debate/useDebate";
import { endDebate } from "@/lib/debate/controls";
import type { Comment, Reaction, Student, Vote } from "@/types";
import { RoundControls } from "@/components/admin/live/round-controls";
import { AttendanceCard } from "@/components/admin/live/attendance-card";
import { VoteCard } from "@/components/admin/live/vote-card";
import { CommentsCard } from "@/components/admin/live/comments-card";
import { ReactionsCard } from "@/components/admin/live/reactions-card";
import { SettingsCard } from "@/components/admin/live/settings-card";
import { DebateStatusBadge } from "@/components/admin/debate-status-badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function LiveControlPage({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = use(params);
  const { debate, rounds, loading } = useDebate(debateId);
  const [students, setStudents] = useState<Student[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [courseCode, setCourseCode] = useState("");
  const [className, setClassName] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);

  useEffect(() => {
    const unsubs = [
      onSnapshot(studentsCol(debateId), (snap) =>
        setStudents(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
      ),
      onSnapshot(votesCol(debateId), (snap) =>
        setVotes(snap.docs.map((d) => d.data()))
      ),
      onSnapshot(
        query(commentsCol(debateId), orderBy("createdAt", "desc"), limit(100)),
        (snap) => setComments(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
      ),
      // Capped to keep Firestore read volume sane in large classes; the
      // header count still reflects totals via this window's length trend.
      onSnapshot(
        query(reactionsCol(debateId), orderBy("createdAt", "desc"), limit(150)),
        (snap) => setReactions(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
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

  if (loading) return <FullPageSpinner />;
  if (!debate) {
    return (
      <EmptyState icon="🔍" title="Debate not found" description="This debate may have been deleted." />
    );
  }

  const joined = students.filter((s) => s.joined).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <DebateStatusBadge status={debate.status} />
            <span className="text-sm text-on-surface-variant">
              {[courseCode, className].filter(Boolean).join(" · ")}
            </span>
            <span className="text-sm text-on-surface-variant">
              · {joined} joined
            </span>
          </div>
          <h1 className="mt-1 truncate font-display text-2xl font-bold text-on-surface">
            {debate.title}
          </h1>
        </div>
        <div className="flex gap-2">
          <Link href={`/display/${debateId}`} target="_blank">
            <Button variant="outline">🖥 Public display</Button>
          </Link>
          {debate.status === "ended" ? (
            <Link href={`/admin/debates/${debateId}/analytics`}>
              <Button>View analytics</Button>
            </Link>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmEnd(true)}>
              End debate
            </Button>
          )}
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon="🧑‍🎓" label="Students joined" value={`${joined}`} sub={`of ${students.length}`} />
        <StatCard icon="💬" label="Total comments" value={`${comments.length}`} sub={`${comments.filter((c) => c.status === "hidden").length} hidden`} />
        <StatCard icon="⚡" label="Reactions" value={`${reactions.length}`} sub="all rounds" />
      </div>

      {/* Main grid */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <RoundControls debate={debate} rounds={rounds} />
          <CommentsCard debate={debate} comments={comments} students={students} />
        </div>
        <div className="flex flex-col gap-6">
          <VoteCard debate={debate} votes={votes} />
          <AttendanceCard students={students} />
          <ReactionsCard reactions={reactions} />
          <SettingsCard debate={debate} rounds={rounds} />
        </div>
      </div>

      <ConfirmDialog
        open={confirmEnd}
        onClose={() => setConfirmEnd(false)}
        onConfirm={() => endDebate(debate, rounds)}
        title="End the debate?"
        description="Voting, comments and reactions close, and students are invited to submit their private reflection."
        confirmLabel="End debate"
        destructive
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-5">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-2xl">
        {icon}
      </span>
      <div>
        <p className="text-sm text-on-surface-variant">{label}</p>
        <p className="font-display text-2xl font-bold text-on-surface">
          {value}{" "}
          {sub && <span className="text-sm font-normal text-on-surface-variant">{sub}</span>}
        </p>
      </div>
    </div>
  );
}
