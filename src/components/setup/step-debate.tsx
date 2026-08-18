"use client";

import { useState } from "react";
import { serverTimestamp, updateDoc } from "firebase/firestore";
import { debateDoc } from "@/lib/firebase/firestore";
import { Input, Label, Textarea } from "@/components/ui/input";
import { StepShell, type StepProps } from "./shared";

export function StepDebate({ debateId, debate, onNext, onBack }: StepProps) {
  const [title, setTitle] = useState(debate.title);
  const [description, setDescription] = useState(debate.description ?? "");
  const [forLabel, setForLabel] = useState(debate.forLabel || "For");
  const [againstLabel, setAgainstLabel] = useState(debate.againstLabel || "Against");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) {
      setError("Debate topic is required.");
      return;
    }
    if (title.trim().length > 200) {
      setError("Debate topic must be 200 characters or fewer.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await updateDoc(debateDoc(debateId), {
        title: title.trim(),
        description: description.trim(),
        forLabel: forLabel.trim() || "For",
        againstLabel: againstLabel.trim() || "Against",
        updatedAt: serverTimestamp(),
      } as never);
      onNext();
    } catch {
      setError("Something went wrong saving the debate. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepShell
      title="Debate Topic"
      description="What will the room debate?"
      onNext={save}
      onBack={onBack}
      busy={busy}
    >
      <div>
        <Label htmlFor="topic">Debate topic *</Label>
        <Input
          id="topic"
          placeholder="Should AI be banned at Unis?"
          maxLength={200}
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <p className="mt-1 text-xs text-on-surface-variant">
          {title.length}/200 characters
        </p>
      </div>
      <div>
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea
          id="description"
          rows={3}
          placeholder="Context or framing for the debate…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="forLabel">“For” side label</Label>
          <Input id="forLabel" value={forLabel} onChange={(e) => setForLabel(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="againstLabel">“Against” side label</Label>
          <Input id="againstLabel" value={againstLabel} onChange={(e) => setAgainstLabel(e.target.value)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}
    </StepShell>
  );
}
