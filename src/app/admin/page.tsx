"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { coursesCol, debatesCol } from "@/lib/firebase/firestore";
import type { Course, Debate } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveBadge } from "@/components/ui/badge";
import { DebateStatusBadge } from "@/components/admin/debate-status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function AdminDashboard() {
  const { user } = useAuth();
  const [debates, setDebates] = useState<Debate[] | null>(null);
  const [courses, setCourses] = useState<Course[] | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubDebates = onSnapshot(
      query(
        debatesCol(),
        where("instructorId", "==", user.uid),
        orderBy("createdAt", "desc")
      ),
      (snap) => setDebates(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    const unsubCourses = onSnapshot(
      query(coursesCol(), where("instructorId", "==", user.uid)),
      (snap) => setCourses(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    return () => {
      unsubDebates();
      unsubCourses();
    };
  }, [user]);

  if (!debates || !courses) return <FullPageSpinner />;

  const active = debates.filter((d) => d.status === "live" || d.status === "paused");
  const courseCode = (id: string) =>
    courses.find((c) => c.id === id)?.courseCode ?? "";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-on-surface">
            Dashboard
          </h1>
          <p className="mt-1 text-on-surface-variant">
            Create, run and review your classroom debates.
          </p>
        </div>
        <Link href="/admin/debates/new">
          <Button size="lg">＋ New Debate</Button>
        </Link>
      </div>

      {active.length > 0 && (
        <Card className="border-primary/40 bg-primary-fixed/40">
          <CardHeader>
            <CardTitle>Happening now</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {active.map((debate) => (
              <div
                key={debate.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-container-lowest p-4"
              >
                <div className="flex items-center gap-3">
                  <LiveBadge />
                  <div>
                    <p className="font-medium text-on-surface">{debate.title}</p>
                    <p className="text-sm text-on-surface-variant">
                      {courseCode(debate.courseId)}
                    </p>
                  </div>
                </div>
                <Link href={`/admin/debates/${debate.id}/live`}>
                  <Button>Open live control</Button>
                </Link>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <section>
        <h2 className="mb-4 font-display text-xl font-semibold text-on-surface">
          Recent debates
        </h2>
        {debates.length === 0 ? (
          <EmptyState
            icon="🎤"
            title="No debates yet"
            description="Create your first debate to import students, generate join codes and run a live session."
            action={
              <Link href="/admin/debates/new">
                <Button>Create a debate</Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {debates.slice(0, 9).map((debate) => (
              <Card key={debate.id} className="transition-shadow hover:shadow-raised">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <DebateStatusBadge status={debate.status} />
                    <span className="text-xs text-on-surface-variant">
                      {courseCode(debate.courseId)}
                    </span>
                  </div>
                  <p className="font-display font-semibold text-on-surface">
                    {debate.title}
                  </p>
                  <div className="mt-auto flex gap-2">
                    {debate.status === "draft" && (
                      <Link href={`/admin/debates/${debate.id}/setup`} className="flex-1">
                        <Button variant="outline" className="w-full">Continue setup</Button>
                      </Link>
                    )}
                    {(debate.status === "ready" ||
                      debate.status === "live" ||
                      debate.status === "paused") && (
                      <Link href={`/admin/debates/${debate.id}/live`} className="flex-1">
                        <Button className="w-full">Live control</Button>
                      </Link>
                    )}
                    {debate.status === "ended" && (
                      <Link href={`/admin/debates/${debate.id}/analytics`} className="flex-1">
                        <Button variant="outline" className="w-full">Analytics</Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
