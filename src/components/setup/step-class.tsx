"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { useAuth } from "@/components/auth-provider";
import { classesCol, debateDoc } from "@/lib/firebase/firestore";
import type { ClassDoc } from "@/types";
import { Input, Label, Select } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { StepShell, type StepProps } from "./shared";

export function StepClass({ debateId, debate, onNext, onBack }: StepProps) {
  const { user } = useAuth();
  const [existing, setExisting] = useState<ClassDoc[]>([]);
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [selected, setSelected] = useState(debate.classId);
  const [className, setClassName] = useState("");
  const [day, setDay] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("Australia/Sydney");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const defaulted = useRef(false);

  // Existing classes under the course chosen in step 1
  useEffect(() => {
    if (!user || !debate.courseId) return;
    return onSnapshot(
      query(
        classesCol(),
        where("instructorId", "==", user.uid),
        where("courseId", "==", debate.courseId)
      ),
      (snap) => {
        const list = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        list.sort((a, b) => a.className.localeCompare(b.className));
        setExisting(list);
        // Default to "use existing" once, without fighting the user's choice
        if (list.length > 0 && !defaulted.current) {
          defaulted.current = true;
          setMode("existing");
        }
      }
    );
  }, [user, debate.courseId]);

  async function useExisting() {
    if (!selected) return;
    setBusy(true);
    try {
      await updateDoc(debateDoc(debateId), {
        classId: selected,
        updatedAt: serverTimestamp(),
      } as never);
      onNext();
    } finally {
      setBusy(false);
    }
  }

  async function createNew() {
    if (!user) return;
    if (!className.trim()) {
      setError("Class name is required.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const payload = {
        courseId: debate.courseId,
        instructorId: user.uid,
        className: className.trim(),
        ...(day.trim() ? { day: day.trim() } : {}),
        ...(startTime ? { startTime } : {}),
        ...(endTime ? { endTime } : {}),
        ...(location.trim() ? { location: location.trim() } : {}),
        timezone,
        updatedAt: serverTimestamp(),
      };
      const ref = await addDoc(classesCol(), {
        ...payload,
        createdAt: serverTimestamp(),
      } as never);
      await updateDoc(debateDoc(debateId), {
        classId: ref.id,
        updatedAt: serverTimestamp(),
      } as never);
      onNext();
    } catch {
      setError("Something went wrong saving the class. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const usingExisting = mode === "existing" && existing.length > 0;

  return (
    <StepShell
      title="Class Details"
      description="Which class session will run this debate?"
      onNext={usingExisting ? useExisting : createNew}
      onBack={onBack}
      nextDisabled={usingExisting && !selected}
      busy={busy}
    >
      {existing.length > 0 && (
        <Tabs
          value={mode}
          onValueChange={setMode}
          tabs={[
            { value: "existing" as const, label: "Use existing class" },
            { value: "new" as const, label: "Create new class" },
          ]}
        />
      )}

      {usingExisting ? (
        <div>
          <Label htmlFor="class-select">Class</Label>
          <Select
            id="class-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Select a class…</option>
            {existing.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {klass.className}
                {klass.location ? ` — ${klass.location}` : ""}
              </option>
            ))}
          </Select>
          <p className="mt-2 text-sm text-on-surface-variant">
            Pick the class session, hit Next and jump straight to the debate topic.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="className">Class name / time *</Label>
              <Input
                id="className"
                placeholder="Tuesday 2 PM"
                required
                value={className}
                onChange={(e) => setClassName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="day">Day (optional)</Label>
              <Input id="day" placeholder="Tuesday" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="location">Location (optional)</Label>
              <Input id="location" placeholder="Room 302" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="startTime">Start time (optional)</Label>
              <Input id="startTime" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="endTime">End time (optional)</Label>
              <Input id="endTime" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
              {error}
            </p>
          )}
        </>
      )}
    </StepShell>
  );
}
