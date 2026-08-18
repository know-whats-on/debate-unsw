"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { coursesCol } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/client";
import { deleteCourse } from "@/lib/debate/deleteDebate";
import type { Course } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function CoursesPage() {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [editing, setEditing] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(
        coursesCol(),
        where("instructorId", "==", user.uid),
        orderBy("createdAt", "desc")
      ),
      (snap) => setCourses(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
  }, [user]);

  if (!courses) return <FullPageSpinner />;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-on-surface">Courses</h1>
          <p className="mt-1 text-on-surface-variant">
            Courses group your classes and debates.
          </p>
        </div>
        <Link href="/admin/courses/new">
          <Button>＋ New course</Button>
        </Link>
      </div>

      {courses.length === 0 ? (
        <EmptyState
          icon="📚"
          title="No courses yet"
          description="Create a course like INFS5704 to organise your debates."
          action={
            <Link href="/admin/courses/new">
              <Button>Create a course</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <Card key={course.id}>
              <CardContent className="p-5">
                <p className="font-display text-lg font-bold text-primary">
                  {course.courseCode}
                </p>
                {course.courseName && (
                  <p className="mt-1 text-on-surface">{course.courseName}</p>
                )}
                {course.term && (
                  <p className="mt-1 text-sm text-on-surface-variant">{course.term}</p>
                )}
                <div className="mt-4 flex gap-2 border-t border-outline-variant/40 pt-3">
                  <Button variant="outline" size="sm" onClick={() => setEditing(course)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-error hover:bg-error-container"
                    onClick={() => setDeleting(course)}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <CourseEditDialog course={editing} onClose={() => setEditing(null)} />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteCourse(deleting.id)}
        title={`Delete course ${deleting?.courseCode}?`}
        description="Debates already created under this course are kept, but the course disappears from your lists."
        confirmLabel="Delete course"
        destructive
      />
    </div>
  );
}

function CourseEditDialog({
  course,
  onClose,
}: {
  course: Course;
  onClose: () => void;
}) {
  const [courseCode, setCourseCode] = useState(course.courseCode);
  const [courseName, setCourseName] = useState(course.courseName ?? "");
  const [term, setTerm] = useState(course.term ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const code = courseCode.trim().toUpperCase();
    if (!code || code.length > 20) {
      setError("Course code is required (max 20 characters).");
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db(), "courses", course.id), {
        courseCode: code,
        courseName: courseName.trim(),
        term: term.trim(),
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch {
      setError("Could not save the course. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit ${course.courseCode}`}>
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="edit-code">Course code *</Label>
          <Input
            id="edit-code"
            maxLength={20}
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
          />
        </div>
        <div>
          <Label htmlFor="edit-name">Course name</Label>
          <Input
            id="edit-name"
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="edit-term">Term</Label>
          <Input id="edit-term" value={term} onChange={(e) => setTerm(e.target.value)} />
        </div>
        {error && (
          <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
