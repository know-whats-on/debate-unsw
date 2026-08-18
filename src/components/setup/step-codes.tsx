"use client";

import { useState } from "react";
import { doc, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { joinCodesCol, studentsCol } from "@/lib/firebase/firestore";
import { generateUniqueJoinCodes } from "@/lib/debate/joinCodes";
import { downloadCsv, toCsv } from "@/lib/csv/exportCsv";
import type { Student } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { StepShell, type StepProps } from "./shared";

/** Core join-code management — shared by wizard step 7 and /codes page. */
export function JoinCodeManager({
  debateId,
  students,
}: {
  debateId: string;
  students: Student[];
}) {
  const [busy, setBusy] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const withCodes = students.filter((s) => s.joinCode);
  const withoutCodes = students.filter((s) => !s.joinCode);

  async function generate(regenerateAll: boolean) {
    setBusy(true);
    try {
      const targets = regenerateAll ? students : withoutCodes;
      if (targets.length === 0) return;
      const keep = regenerateAll
        ? new Set<string>()
        : new Set(withCodes.map((s) => s.joinCode));
      const codes = generateUniqueJoinCodes(targets.length, keep);

      for (let start = 0; start < targets.length; start += 200) {
        const batch = writeBatch(db());
        targets.slice(start, start + 200).forEach((student, i) => {
          const code = codes[start + i];
          if (regenerateAll && student.joinCode) {
            batch.delete(doc(joinCodesCol(debateId), student.joinCode));
          }
          batch.update(doc(studentsCol(debateId), student.id), {
            joinCode: code,
            updatedAt: serverTimestamp(),
          } as never);
          batch.set(doc(joinCodesCol(debateId), code), {
            joinCode: code,
            debateId,
            studentDocId: student.id,
            used: false,
            createdAt: serverTimestamp(),
          } as never);
        });
        await batch.commit();
      }
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const csv = toCsv(
      ["Student Name", "Student ID", "Email", "Join Code"],
      [...students]
        .sort((a, b) => a.fullName.localeCompare(b.fullName))
        .map((s) => [s.fullName, s.universityStudentId, s.email, s.joinCode])
    );
    downloadCsv("digital-jury-join-codes.csv", csv);
  }

  if (students.length === 0) {
    return (
      <EmptyState
        icon="🎟️"
        title="No students imported yet"
        description="Import your class list first — codes are generated per student."
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone="primary">
          {withCodes.length}/{students.length} codes generated
        </Badge>
        {withoutCodes.length > 0 && (
          <Button onClick={() => generate(false)} disabled={busy}>
            {busy ? "Generating…" : `Generate ${withoutCodes.length} codes`}
          </Button>
        )}
        {withCodes.length > 0 && (
          <>
            <Button variant="outline" onClick={() => setConfirmRegen(true)} disabled={busy}>
              Regenerate all codes
            </Button>
            <Button variant="outline" onClick={download}>
              ⬇ Download CSV
            </Button>
          </>
        )}
      </div>

      <p className="text-sm text-on-surface-variant">
        Share the CSV with students however you prefer (email, LMS, printout).
        Codes are 6 readable characters — no 0/O or 1/I. Digital Jury does not
        email students automatically.
      </p>

      <div className="max-h-96 overflow-y-auto rounded-xl border border-outline-variant/60">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface-container-low text-xs uppercase tracking-wide text-on-surface-variant">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">Student ID</th>
              <th className="hidden px-4 py-2 md:table-cell">Email</th>
              <th className="px-4 py-2">Join code</th>
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
                    {s.joinCode ? (
                      <code className="rounded bg-primary/10 px-2 py-0.5 font-mono font-bold tracking-widest text-primary">
                        {s.joinCode}
                      </code>
                    ) : (
                      <span className="text-on-surface-variant">—</span>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmRegen}
        onClose={() => setConfirmRegen(false)}
        onConfirm={() => generate(true)}
        title="Regenerate all join codes?"
        description="Every student gets a new code. Any codes you already shared will stop working."
        confirmLabel="Regenerate all"
        destructive
      />
    </div>
  );
}

export function StepCodes({ debateId, students, onNext, onBack }: StepProps) {
  const allHaveCodes =
    students.length > 0 && students.every((s) => s.joinCode);
  return (
    <StepShell
      title="Student Join Codes"
      description="Each student gets a private 6-character code that identifies them when they join."
      onNext={onNext}
      onBack={onBack}
      nextDisabled={!allHaveCodes}
      nextLabel={allHaveCodes ? "Next" : "Generate codes to continue"}
    >
      <JoinCodeManager debateId={debateId} students={students} />
    </StepShell>
  );
}
