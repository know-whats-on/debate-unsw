"use client";

import { useEffect, useState } from "react";
import { onSnapshot, query, updateDoc, where } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { coursesCol, debateDoc } from "@/lib/firebase/firestore";
import type { Course } from "@/types";
import { CourseForm } from "@/components/admin/course-form";
import { Tabs } from "@/components/ui/tabs";
import { Label, Select } from "@/components/ui/input";
import { StepShell, type StepProps } from "./shared";

export function StepCourse({ debateId, debate, onNext }: StepProps) {
  const { user } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [selected, setSelected] = useState(debate.courseId);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      query(coursesCol(), where("instructorId", "==", user.uid)),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        setCourses(list);
        if (list.length > 0) setMode((m) => (debate.courseId ? "existing" : m));
      }
    );
  }, [user, debate.courseId]);

  async function saveCourse(courseId: string) {
    await updateDoc(debateDoc(debateId), { courseId } as never);
  }

  return (
    <StepShell
      title="Create Course"
      description="Which course is this debate for?"
      onNext={onNext}
      showBack={false}
      nextDisabled={!(mode === "existing" && selected)}
      hideNext={mode === "new"}
    >
      {courses.length > 0 && (
        <Tabs
          value={mode}
          onValueChange={setMode}
          tabs={[
            { value: "existing" as const, label: "Use existing course" },
            { value: "new" as const, label: "Create new course" },
          ]}
        />
      )}

      {mode === "existing" && courses.length > 0 ? (
        <div>
          <Label htmlFor="course">Course</Label>
          <Select
            id="course"
            value={selected}
            onChange={async (e) => {
              setSelected(e.target.value);
              if (e.target.value) await saveCourse(e.target.value);
            }}
          >
            <option value="">Select a course…</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.courseCode}
                {c.courseName ? ` — ${c.courseName}` : ""}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <CourseForm
          submitLabel="Create course & continue"
          onCreated={async (courseId) => {
            await saveCourse(courseId);
            onNext();
          }}
        />
      )}
    </StepShell>
  );
}
