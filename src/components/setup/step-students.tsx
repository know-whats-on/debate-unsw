"use client";

import { useRef, useState, type DragEvent } from "react";
import { doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { studentsCol, joinCodesCol } from "@/lib/firebase/firestore";
import { parseStudentsCsv, type ParsedStudent } from "@/lib/csv/parseStudents";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { StepShell, type StepProps } from "./shared";
import type { Student } from "@/types";

type AssignedSide = "for" | "against" | "audience";

export function StepStudents({ debateId, debate, students, onNext, onBack }: StepProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [parsed, setParsed] = useState<ParsedStudent[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setErrors(["Please upload a .csv file."]);
      setParsed(null);
      return;
    }
    const text = await file.text();
    const result = parseStudentsCsv(text);
    setErrors(result.errors);
    setParsed(result.errors.length === 0 ? result.students : null);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function importStudents() {
    if (!parsed) return;
    setBusy(true);
    try {
      // Re-import replaces any previously imported roster (and their codes).
      const [existingStudents, existingCodes] = await Promise.all([
        getDocs(studentsCol(debateId)),
        getDocs(joinCodesCol(debateId)),
      ]);
      const clearBatch = writeBatch(db());
      existingStudents.docs.forEach((d) => clearBatch.delete(d.ref));
      existingCodes.docs.forEach((d) => clearBatch.delete(d.ref));
      await clearBatch.commit();

      // Firestore batches cap at 500 writes
      for (let start = 0; start < parsed.length; start += 400) {
        const batch = writeBatch(db());
        for (const s of parsed.slice(start, start + 400)) {
          batch.set(doc(studentsCol(debateId)), {
            debateId,
            firstName: s.firstName,
            lastName: s.lastName,
            fullName: `${s.firstName} ${s.lastName}`,
            universityStudentId: s.universityStudentId,
            email: s.email,
            joinCode: "",
            joined: false,
            assignedSide: "audience",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          } as never);
        }
        await batch.commit();
      }
      setParsed(null);
    } catch {
      setErrors(["Something went wrong importing students. Please try again."]);
    } finally {
      setBusy(false);
    }
  }

  async function setSide(student: Student, side: AssignedSide) {
    const batch = writeBatch(db());
    batch.update(doc(studentsCol(debateId), student.id), {
      assignedSide: side,
      updatedAt: serverTimestamp(),
    } as never);
    await batch.commit();
  }

  const imported = students.length > 0;

  return (
    <StepShell
      title="Import Students"
      description="Upload your class list CSV. Required columns: First Name, Last Name, Student ID, Email."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!imported}
      nextLabel={imported ? "Next" : "Import students to continue"}
    >
      {/* Upload zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload class list CSV"
        onClick={() => fileInput.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && fileInput.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-outline-variant bg-surface-container-low hover:border-primary/60"
        )}
      >
        <span className="text-3xl">📄</span>
        <p className="font-medium text-on-surface">
          Drag & drop your CSV here, or click to browse
        </p>
        <p className="text-sm text-on-surface-variant">
          First Name, Last Name, Student ID, Email
        </p>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {errors.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 rounded-lg bg-error-container px-4 py-3 text-sm text-on-error-container">
          {errors.slice(0, 8).map((err) => (
            <p key={err}>{err}</p>
          ))}
          {errors.length > 8 && <p>…and {errors.length - 8} more issues.</p>}
        </div>
      )}

      {/* Parsed preview before import */}
      {parsed && (
        <div className="rounded-xl border border-outline-variant/60">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/40 p-4">
            <p className="font-medium text-on-surface">
              {parsed.length} students detected
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setParsed(null)}>
                Cancel
              </Button>
              <Button size="sm" onClick={importStudents} disabled={busy}>
                {busy
                  ? "Importing…"
                  : imported
                    ? "Replace roster with these students"
                    : `Import ${parsed.length} students`}
              </Button>
            </div>
          </div>
          <PreviewTable rows={parsed.slice(0, 8)} />
          {parsed.length > 8 && (
            <p className="px-4 py-2 text-xs text-on-surface-variant">
              Showing first 8 of {parsed.length} rows.
            </p>
          )}
        </div>
      )}

      {/* Imported roster */}
      {imported ? (
        <div className="rounded-xl border border-outline-variant/60">
          <div className="flex items-center justify-between border-b border-outline-variant/40 p-4">
            <p className="font-medium text-on-surface">
              Imported roster{" "}
              <Badge tone="primary" className="ml-2">
                {students.length} students
              </Badge>
            </p>
            <p className="text-xs text-on-surface-variant">
              Optionally assign debaters to the {debate.forLabel} or{" "}
              {debate.againstLabel} team. Everyone else stays audience.
            </p>
          </div>
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
                <tr>
                  <th className="px-4 py-2">Name</th>
                  <th className="px-4 py-2">Student ID</th>
                  <th className="hidden px-4 py-2 md:table-cell">Email</th>
                  <th className="px-4 py-2">Team</th>
                </tr>
              </thead>
              <tbody>
                {[...students]
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((s) => (
                    <tr key={s.id} className="border-t border-outline-variant/30">
                      <td className="px-4 py-2 font-medium text-on-surface">{s.fullName}</td>
                      <td className="px-4 py-2 text-on-surface-variant">{s.universityStudentId}</td>
                      <td className="hidden px-4 py-2 text-on-surface-variant md:table-cell">{s.email}</td>
                      <td className="px-4 py-2">
                        <Select
                          aria-label={`Team for ${s.fullName}`}
                          className="h-9 w-36"
                          value={s.assignedSide ?? "audience"}
                          onChange={(e) => setSide(s, e.target.value as AssignedSide)}
                        >
                          <option value="audience">Audience</option>
                          <option value="for">Team {debate.forLabel}</option>
                          <option value="against">Team {debate.againstLabel}</option>
                        </Select>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        !parsed && (
          <EmptyState
            icon="🧑‍🎓"
            title="No students imported yet"
            description="Upload your class list CSV above to add students to this debate."
          />
        )
      )}
    </StepShell>
  );
}

function PreviewTable({ rows }: { rows: ParsedStudent[] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
        <tr>
          <th className="px-4 py-2">First Name</th>
          <th className="px-4 py-2">Last Name</th>
          <th className="px-4 py-2">Student ID</th>
          <th className="px-4 py-2">Email</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.universityStudentId} className="border-t border-outline-variant/30">
            <td className="px-4 py-2">{r.firstName}</td>
            <td className="px-4 py-2">{r.lastName}</td>
            <td className="px-4 py-2">{r.universityStudentId}</td>
            <td className="px-4 py-2">{r.email}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
