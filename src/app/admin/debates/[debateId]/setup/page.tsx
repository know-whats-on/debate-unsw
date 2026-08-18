"use client";

import { use, useEffect, useState } from "react";
import { onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { debateDoc, roundsCol, studentsCol, promptsCol } from "@/lib/firebase/firestore";
import type { Debate, Prompt, Round, Student } from "@/types";
import { FullPageSpinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils/cn";
import { StepCourse } from "@/components/setup/step-course";
import { StepClass } from "@/components/setup/step-class";
import { StepDebate } from "@/components/setup/step-debate";
import { StepRounds } from "@/components/setup/step-rounds";
import { StepStudents } from "@/components/setup/step-students";
import { StepPrompts } from "@/components/setup/step-prompts";
import { StepCodes } from "@/components/setup/step-codes";
import { StepAccess } from "@/components/setup/step-access";

const STEPS = [
  "Create Course",
  "Class Details",
  "Debate Topic",
  "Rounds + Breaks",
  "Import Students",
  "Prompts / Questions",
  "Generate Codes",
  "Share & Invite",
];

export default function SetupWizardPage({
  params,
}: {
  params: Promise<{ debateId: string }>;
}) {
  const { debateId } = use(params);
  const [debate, setDebate] = useState<Debate | null | undefined>(undefined);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    const unsub1 = onSnapshot(debateDoc(debateId), (snap) => {
      const data = snap.exists() ? { ...snap.data(), id: snap.id } : null;
      setDebate(data);
      setStep((s) => s ?? data?.setupStep ?? 1);
    });
    const unsub2 = onSnapshot(
      query(roundsCol(debateId), orderBy("index")),
      (snap) => setRounds(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    const unsub3 = onSnapshot(studentsCol(debateId), (snap) =>
      setStudents(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    const unsub4 = onSnapshot(
      query(promptsCol(debateId), orderBy("order")),
      (snap) => setPrompts(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [debateId]);

  if (debate === undefined || step === null) return <FullPageSpinner />;
  if (debate === null) {
    return (
      <EmptyState
        icon="🔍"
        title="Debate not found"
        description="This debate may have been deleted."
      />
    );
  }

  async function goTo(next: number) {
    const clamped = Math.min(8, Math.max(1, next));
    setStep(clamped);
    const highest = Math.max(debate?.setupStep ?? 1, clamped);
    await updateDoc(debateDoc(debateId), { setupStep: highest } as never);
    window.scrollTo({ top: 0 });
  }

  const stepProps = {
    debateId,
    debate,
    rounds,
    students,
    prompts,
    onNext: () => goTo(step + 1),
    onBack: () => goTo(step - 1),
  };

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      {/* Desktop stepper sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block" aria-label="Setup steps">
        <p className="font-display text-lg font-bold text-primary">Setup Wizard</p>
        <p className="mb-6 mt-1 truncate text-sm text-on-surface-variant">
          {debate.title || "New debate"}
        </p>
        <ol className="flex flex-col gap-1">
          {STEPS.map((label, i) => {
            const number = i + 1;
            const state =
              number === step ? "current" : number < (debate.setupStep ?? 1) || number < step ? "done" : "todo";
            return (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => goTo(number)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors",
                    state === "current"
                      ? "bg-primary text-on-primary shadow-raised"
                      : state === "done"
                        ? "text-on-surface hover:bg-surface-container"
                        : "text-on-surface-variant hover:bg-surface-container"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      state === "current"
                        ? "bg-on-primary/20 text-on-primary"
                        : state === "done"
                          ? "bg-primary/15 text-primary"
                          : "bg-surface-container-high text-on-surface-variant"
                    )}
                  >
                    {state === "done" ? "✓" : number}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Mobile progress bar */}
      <div className="lg:hidden">
        <div className="mb-2 flex items-baseline justify-between">
          <p className="font-display font-semibold text-on-surface">
            Step {step} of 8 — {STEPS[step - 1]}
          </p>
          <span className="text-xs text-on-surface-variant">
            {Math.round((step / 8) * 100)}%
          </span>
        </div>
        <Progress value={(step / 8) * 100} />
      </div>

      <div className="min-w-0 flex-1">
        {step === 1 && <StepCourse {...stepProps} />}
        {step === 2 && <StepClass {...stepProps} />}
        {step === 3 && <StepDebate {...stepProps} />}
        {step === 4 && <StepRounds {...stepProps} />}
        {step === 5 && <StepStudents {...stepProps} />}
        {step === 6 && <StepPrompts {...stepProps} />}
        {step === 7 && <StepCodes {...stepProps} />}
        {step === 8 && <StepAccess {...stepProps} />}
      </div>
    </div>
  );
}
