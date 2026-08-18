"use client";

import type { ReactNode } from "react";
import type { Debate, Prompt, Round, Student } from "@/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export interface StepProps {
  debateId: string;
  debate: Debate;
  rounds: Round[];
  students: Student[];
  prompts: Prompt[];
  onNext: () => void;
  onBack: () => void;
}

export function StepShell({
  title,
  description,
  children,
  onNext,
  onBack,
  nextLabel = "Next",
  nextDisabled = false,
  hideNext = false,
  showBack = true,
  busy = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onNext?: () => void;
  onBack?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  hideNext?: boolean;
  showBack?: boolean;
  busy?: boolean;
}) {
  return (
    <Card className="shadow-raised">
      <CardHeader>
        <CardTitle className="text-2xl">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {children}
        <div className="flex items-center justify-between border-t border-outline-variant/50 pt-5">
          {showBack && onBack ? (
            <Button variant="outline" onClick={onBack}>
              ← Back
            </Button>
          ) : (
            <span />
          )}
          {!hideNext && onNext && (
            <Button size="lg" onClick={onNext} disabled={nextDisabled || busy}>
              {busy ? "Saving…" : nextLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
