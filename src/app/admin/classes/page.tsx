"use client";

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
import { classesCol, coursesCol } from "@/lib/firebase/firestore";
import { db } from "@/lib/firebase/client";
import { deleteClass } from "@/lib/debate/deleteDebate";
import type { ClassDoc, Course } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, ConfirmDialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { FullPageSpinner } from "@/components/ui/spinner";

export default function ClassesPage() {
  const { user } = useAuth();
  const [classes, setClasses] = useState<ClassDoc[] | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [editing, setEditing] = useState<ClassDoc | null>(null);
  const [deleting, setDeleting] = useState<ClassDoc | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsub1 = onSnapshot(
      query(
        classesCol(),
        where("instructorId", "==", user.uid),
        orderBy("createdAt", "desc")
      ),
      (snap) => setClasses(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
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

  if (!classes) return <FullPageSpinner />;

  const courseCode = (id: string) =>
    courses.find((c) => c.id === id)?.courseCode ?? "—";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-on-surface">Classes</h1>
        <p className="mt-1 text-on-surface-variant">
          Class sessions that run your debates. New classes are created inside
          the debate setup wizard.
        </p>
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon="🏫"
          title="No classes yet"
          description="Classes are created in step 2 of the debate setup wizard."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((klass) => (
            <Card key={klass.id}>
              <CardContent className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">
                  {courseCode(klass.courseId)}
                </p>
                <p className="mt-1 font-display text-lg font-bold text-on-surface">
                  {klass.className}
                </p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  {[klass.day, klass.startTime && `${klass.startTime}–${klass.endTime || "…"}`, klass.location]
                    .filter(Boolean)
                    .join(" · ") || klass.timezone}
                </p>
                <div className="mt-4 flex gap-2 border-t border-outline-variant/40 pt-3">
                  <Button variant="outline" size="sm" onClick={() => setEditing(klass)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-error hover:bg-error-container"
                    onClick={() => setDeleting(klass)}
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
        <ClassEditDialog
          klass={editing}
          courses={courses}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteClass(deleting.id)}
        title={`Delete class "${deleting?.className}"?`}
        description="Debates already linked to this class are kept."
        confirmLabel="Delete class"
        destructive
      />
    </div>
  );
}

function ClassEditDialog({
  klass,
  courses,
  onClose,
}: {
  klass: ClassDoc;
  courses: Course[];
  onClose: () => void;
}) {
  const [className, setClassName] = useState(klass.className);
  const [courseId, setCourseId] = useState(klass.courseId);
  const [day, setDay] = useState(klass.day ?? "");
  const [startTime, setStartTime] = useState(klass.startTime ?? "");
  const [endTime, setEndTime] = useState(klass.endTime ?? "");
  const [location, setLocation] = useState(klass.location ?? "");
  const [timezone, setTimezone] = useState(klass.timezone);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!className.trim()) {
      setError("Class name is required.");
      return;
    }
    setBusy(true);
    try {
      await updateDoc(doc(db(), "classes", klass.id), {
        className: className.trim(),
        courseId,
        day: day.trim(),
        startTime,
        endTime,
        location: location.trim(),
        timezone: timezone.trim() || "Australia/Sydney",
        updatedAt: serverTimestamp(),
      });
      onClose();
    } catch {
      setError("Could not save the class. Please try again.");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={onClose} title={`Edit ${klass.className}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="c-name">Class name *</Label>
          <Input id="c-name" value={className} onChange={(e) => setClassName(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="c-course">Course</Label>
          <Select id="c-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.courseCode}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="c-day">Day</Label>
          <Input id="c-day" value={day} onChange={(e) => setDay(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="c-location">Location</Label>
          <Input id="c-location" value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="c-start">Start time</Label>
          <Input id="c-start" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="c-end">End time</Label>
          <Input id="c-end" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="c-tz">Timezone</Label>
          <Input id="c-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Dialog>
  );
}
