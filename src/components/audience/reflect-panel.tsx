"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { doc, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { promptsCol, reflectionsCol } from "@/lib/firebase/firestore";
import {
  availableReflectionPrompts,
  loadAnswerCache,
  saveAnswerCache,
  type AvailablePrompt,
} from "@/lib/debate/reflectionPrompts";
import type { Debate, Prompt, StudentSession } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";

const MIN_CHARS = 20;
const MAX_CHARS = 1000;

export function ReflectPanel({
  debate,
  session,
}: {
  debate: Debate;
  session: StudentSession;
}) {
  const [prompts, setPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    return onSnapshot(
      query(promptsCol(debate.id), where("type", "==", "private_reflection_prompt")),
      (snap) => setPrompts(snap.docs.map((d) => ({ ...d.data(), id: d.id })))
    );
  }, [debate.id]);

  const available = useMemo(
    () => availableReflectionPrompts(debate, prompts),
    [debate, prompts]
  );

  if (!debate.reflectionsEnabled) {
    return (
      <p className="rounded-lg bg-accent-amber/15 px-4 py-3 text-sm font-medium text-on-surface">
        Reflections are currently disabled by your instructor.
      </p>
    );
  }

  if (available.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl bg-surface-container-low px-6 py-12 text-center">
        <span className="text-3xl">📝</span>
        <p className="font-display font-semibold text-on-surface">
          No reflection prompts yet
        </p>
        <p className="max-w-sm text-sm text-on-surface-variant">
          Prompts appear here after each round finishes, and at the end of the
          debate.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {debate.status === "ended" && (
        <div className="rounded-xl bg-primary/5 px-4 py-3 text-center">
          <p className="font-display text-lg font-bold text-on-surface">
            🎉 Debate complete!
          </p>
          <p className="mt-1 text-sm text-on-surface-variant">
            One last thing — your private reflections.
          </p>
        </div>
      )}

      {available.map((prompt) => (
        <PromptResponse
          key={prompt.promptId ?? "default"}
          debateId={debate.id}
          session={session}
          prompt={prompt}
        />
      ))}

      <p className="text-center text-xs text-on-surface-variant">
        Your reflections are private and only visible to your instructor.
      </p>
    </div>
  );
}

function PromptResponse({
  debateId,
  session,
  prompt,
}: {
  debateId: string;
  session: StudentSession;
  prompt: AvailablePrompt;
}) {
  const docId = prompt.responseDocId(session.studentDocId);
  const [text, setText] = useState(() => loadAnswerCache(debateId)[docId] ?? "");
  const [submitted, setSubmitted] = useState(
    () => (loadAnswerCache(debateId)[docId] ?? "").length >= MIN_CHARS
  );
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = text.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (trimmed.length < MIN_CHARS) {
      setError(`Please write at least ${MIN_CHARS} characters.`);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await setDoc(
        doc(reflectionsCol(debateId), docId),
        {
          debateId,
          studentDocId: session.studentDocId,
          studentName: session.fullName,
          universityStudentId: "",
          email: "",
          text: trimmed.slice(0, MAX_CHARS),
          promptText: prompt.text,
          ...(prompt.promptId ? { promptId: prompt.promptId } : {}),
          ...(prompt.roundIndex !== undefined ? { roundIndex: prompt.roundIndex } : {}),
          ...(submitted ? {} : { submittedAt: serverTimestamp() }),
          updatedAt: serverTimestamp(),
        } as never,
        { merge: true }
      );
      saveAnswerCache(debateId, docId, trimmed);
      setSubmitted(true);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("We could not save your reflection. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-on-surface">{prompt.text}</p>
        <Badge tone={submitted ? "success" : "warning"} className="shrink-0">
          {submitted ? "✓ Answered" : prompt.label}
        </Badge>
      </div>

      <Textarea
        aria-label={`Response to: ${prompt.text}`}
        rows={4}
        maxLength={MAX_CHARS}
        placeholder="Write your reflection…"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-right text-xs text-on-surface-variant">
        {words} {words === 1 ? "word" : "words"} · {trimmed.length}/{MAX_CHARS}{" "}
        characters
        {trimmed.length > 0 && trimmed.length < MIN_CHARS && (
          <span className="text-accent-flame"> (minimum {MIN_CHARS})</span>
        )}
      </p>

      {error && (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy || trimmed.length < MIN_CHARS}>
        {busy
          ? "Saving…"
          : saved
            ? "✓ Saved"
            : submitted
              ? "Update response"
              : "Submit response"}
      </Button>
    </form>
  );
}
