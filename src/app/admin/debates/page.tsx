"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { coursesCol, debatesCol } from "@/lib/firebase/firestore";
import { deleteDebateDeep } from "@/lib/debate/deleteDebate";
import type { Course, Debate } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { DebateStatusBadge } from "@/components/admin/debate-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function DebatesPage() {
  const { user } = useAuth();
  const [debates, setDebates] = useState<Debate[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [deleting, setDeleting] = useState<Debate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    const unsub1 = onSnapshot(
      query(
        debatesCol(),
        where("instructorId", "==", user.uid),
        orderBy("createdAt", "desc")
      ),
      (snap) => setDebates(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    const unsub2 = onSnapshot(
      query(coursesCol(), where("instructorId", "==", user.uid)),
      (snap) => setCourses(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    return () => {
      unsub1();
      unsub2();
    };
  }, [user]);

  if (!debates) return <FullPageSpinner />;

  const courseCode = (id: string) =>
    courses.find((c) => c.id === id)?.courseCode ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-on-surface">Debates</h1>
          <p className="mt-1 text-on-surface-variant">
            All debates you have created, newest first.
          </p>
        </div>
        <Link href="/admin/debates/new">
          <Button>＋ New debate</Button>
        </Link>
      </div>

      {debates.length === 0 ? (
        <EmptyState
          icon="🎤"
          title="No debates yet"
          description="Start the setup wizard to create your first live debate."
          action={
            <Link href="/admin/debates/new">
              <Button>Create a debate</Button>
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {debates.map((debate) => (
            <Card key={debate.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <DebateStatusBadge status={debate.status} />
                    <span className="text-xs font-medium text-on-surface-variant">
                      {courseCode(debate.courseId)}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-display font-semibold text-on-surface">
                    {debate.title || "Untitled debate"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link href={`/admin/debates/${debate.id}/setup`}>
                    <Button variant="outline" size="sm">Setup</Button>
                  </Link>
                  <Link href={`/admin/debates/${debate.id}/codes`}>
                    <Button variant="outline" size="sm">Codes</Button>
                  </Link>
                  {debate.status !== "draft" && debate.status !== "ended" && (
                    <Link href={`/admin/debates/${debate.id}/live`}>
                      <Button size="sm">Live</Button>
                    </Link>
                  )}
                  {debate.status === "ended" && (
                    <Link href={`/admin/debates/${debate.id}/analytics`}>
                      <Button size="sm" variant="outline">Analytics</Button>
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-error hover:bg-error-container"
                    onClick={() => setDeleting(debate)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => (deleteBusy ? undefined : setDeleting(null))}
        onConfirm={async () => {
          if (!deleting) return;
          setDeleteBusy(true);
          try {
            await deleteDebateDeep(deleting.id);
          } finally {
            setDeleteBusy(false);
            setDeleting(null);
          }
        }}
        title={`Delete debate "${deleting?.title || "Untitled"}"?`}
        description="This permanently removes the debate with all its rounds, students, join codes, votes, comments, reactions and reflections. This cannot be undone."
        confirmLabel={deleteBusy ? "Deleting…" : "Delete everything"}
        destructive
      />
    </div>
  );
}
