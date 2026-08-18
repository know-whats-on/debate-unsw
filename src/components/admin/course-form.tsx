"use client";

import { useState, type FormEvent } from "react";
import { addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { coursesCol } from "@/lib/firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function CourseForm({
  onCreated,
  submitLabel = "Create course",
}: {
  onCreated: (courseId: string) => void;
  submitLabel?: string;
}) {
  const { user } = useAuth();
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [term, setTerm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const code = courseCode.trim().toUpperCase();
    if (!code) {
      setError("Course code is required.");
      return;
    }
    if (code.length > 20) {
      setError("Course code must be 20 characters or fewer.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const ref = await addDoc(coursesCol(), {
        instructorId: user.uid,
        courseCode: code,
        ...(courseName.trim() ? { courseName: courseName.trim() } : {}),
        ...(term.trim() ? { term: term.trim() } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        // id filled by reader; Firestore doc id is canonical
      } as never);
      onCreated(ref.id);
    } catch {
      setError("Something went wrong creating the course. Please try again.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="courseCode">Course code *</Label>
        <Input
          id="courseCode"
          placeholder="INFS5704"
          maxLength={20}
          required
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value.toUpperCase())}
        />
      </div>
      <div>
        <Label htmlFor="courseName">Course name (optional)</Label>
        <Input
          id="courseName"
          placeholder="Information Systems Research"
          value={courseName}
          onChange={(e) => setCourseName(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="term">Term (optional)</Label>
        <Input
          id="term"
          placeholder="Semester 2, 2026"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy} className="self-start">
        {busy ? "Creating…" : submitLabel}
      </Button>
    </form>
  );
}
