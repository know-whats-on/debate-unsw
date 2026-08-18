"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { promptsCol } from "@/lib/firebase/firestore";
import type { Prompt, PromptType } from "@/types";
import { Button } from "@/components/ui/button";
import { Label, Select, Textarea } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { StepShell, type StepProps } from "./shared";

const GENERAL_KEY = "general";

export function StepPrompts({ debateId, rounds, prompts, onNext, onBack }: StepProps) {
  const [tab, setTab] = useState<PromptType>("public_guiding_question");

  return (
    <StepShell
      title="Prompts / Guiding Questions"
      description="Guiding questions steer the public comment feed each round. Private reflection prompts stay between you and each student."
      onNext={onNext}
      onBack={onBack}
    >
      <Tabs
        value={tab}
        onValueChange={setTab}
        tabs={[
          { value: "public_guiding_question" as const, label: "Guiding Questions" },
          { value: "private_reflection_prompt" as const, label: "Private Prompts" },
        ]}
      />

      {tab === "public_guiding_question" ? (
        <GuidingQuestionsEditor
          debateId={debateId}
          rounds={rounds}
          prompts={prompts.filter((p) => p.type === "public_guiding_question")}
        />
      ) : (
        <PrivatePromptsEditor
          debateId={debateId}
          rounds={rounds}
          prompts={prompts.filter((p) => p.type === "private_reflection_prompt")}
          allPromptCount={prompts.length}
        />
      )}
    </StepShell>
  );
}

/* ------------------------------------------------------------------
   Guiding questions: one textarea per round, one question per line.
   Saving replaces the debate's guiding-question docs to match the boxes.
------------------------------------------------------------------- */
function GuidingQuestionsEditor({
  debateId,
  rounds,
  prompts,
}: {
  debateId: string;
  rounds: StepProps["rounds"];
  prompts: Prompt[];
}) {
  const [boxes, setBoxes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const initialised = useRef(false);

  // Fill the textareas from existing prompt docs once
  useEffect(() => {
    if (initialised.current) return;
    initialised.current = true;
    const next: Record<string, string> = {};
    for (const prompt of [...prompts].sort((a, b) => a.order - b.order)) {
      const key =
        prompt.roundIndex === undefined || prompt.roundIndex === null
          ? GENERAL_KEY
          : String(prompt.roundIndex);
      next[key] = next[key] ? `${next[key]}\n${prompt.text}` : prompt.text;
    }
    setBoxes(next);
  }, [prompts]);

  async function save() {
    setBusy(true);
    try {
      // Replace all guiding-question docs with the current textarea contents
      const batch = writeBatch(db());
      prompts.forEach((p) => batch.delete(doc(promptsCol(debateId), p.id)));
      let order = 0;
      const entries: [string, string][] = [
        [GENERAL_KEY, boxes[GENERAL_KEY] ?? ""],
        ...rounds.map(
          (r) => [String(r.index), boxes[String(r.index)] ?? ""] as [string, string]
        ),
      ];
      for (const [key, value] of entries) {
        for (const line of value.split("\n")) {
          const text = line.trim();
          if (!text) continue;
          batch.set(doc(promptsCol(debateId)), {
            debateId,
            type: "public_guiding_question",
            text,
            ...(key === GENERAL_KEY ? {} : { roundIndex: Number(key) }),
            order: order++,
            createdAt: serverTimestamp(),
          } as never);
        }
      }
      await batch.commit();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-on-surface-variant">
        Write one question per line. Each round&apos;s questions appear on
        student screens only during that round; &ldquo;whole debate&rdquo;
        questions stay visible throughout.
      </p>

      <div>
        <Label htmlFor="gq-general">Whole debate</Label>
        <Textarea
          id="gq-general"
          rows={2}
          placeholder={"What is a key point you agree or disagree with?"}
          value={boxes[GENERAL_KEY] ?? ""}
          onChange={(e) => setBoxes((b) => ({ ...b, [GENERAL_KEY]: e.target.value }))}
        />
      </div>

      {rounds.map((round) => (
        <div key={round.id}>
          <Label htmlFor={`gq-${round.index}`}>
            Round {round.index + 1}: {round.title}
          </Label>
          <Textarea
            id={`gq-${round.index}`}
            rows={2}
            placeholder={"One question per line…"}
            value={boxes[String(round.index)] ?? ""}
            onChange={(e) =>
              setBoxes((b) => ({ ...b, [String(round.index)]: e.target.value }))
            }
          />
        </div>
      ))}

      <Button onClick={save} disabled={busy} className="self-start">
        {busy ? "Saving…" : saved ? "✓ Saved" : "Save guiding questions"}
      </Button>
    </div>
  );
}

/* ------------------------------------------------------------------
   Private reflection prompts: add/edit/delete with round association.
   Round-linked prompts appear to students once that round has begun;
   general prompts appear after the debate ends.
------------------------------------------------------------------- */
function PrivatePromptsEditor({
  debateId,
  rounds,
  prompts,
  allPromptCount,
}: {
  debateId: string;
  rounds: StepProps["rounds"];
  prompts: Prompt[];
  allPromptCount: number;
}) {
  const [text, setText] = useState("");
  const [roundIndex, setRoundIndex] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function savePrompt() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        await updateDoc(doc(promptsCol(debateId), editingId), {
          text: text.trim(),
          roundIndex: roundIndex === "" ? null : Number(roundIndex),
        } as never);
      } else {
        await addDoc(promptsCol(debateId), {
          debateId,
          type: "private_reflection_prompt",
          text: text.trim(),
          ...(roundIndex === "" ? {} : { roundIndex: Number(roundIndex) }),
          order: allPromptCount,
          createdAt: serverTimestamp(),
        } as never);
      }
      setText("");
      setRoundIndex("");
      setEditingId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-outline-variant/60 bg-surface-container-low p-4">
        <Label htmlFor="prompt-text">
          {editingId ? "Edit prompt" : "New private reflection prompt"}
        </Label>
        <Textarea
          id="prompt-text"
          rows={2}
          placeholder="What do you think is the strongest argument that the For Team made?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <Label htmlFor="prompt-round">Ask after (optional)</Label>
            <Select
              id="prompt-round"
              className="w-56"
              value={roundIndex}
              onChange={(e) => setRoundIndex(e.target.value)}
            >
              <option value="">End of debate</option>
              {rounds.map((r) => (
                <option key={r.id} value={r.index}>
                  Round {r.index + 1}: {r.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex gap-2">
            {editingId && (
              <Button
                variant="outline"
                onClick={() => {
                  setEditingId(null);
                  setText("");
                  setRoundIndex("");
                }}
              >
                Cancel
              </Button>
            )}
            <Button onClick={savePrompt} disabled={busy || !text.trim()}>
              {editingId ? "Save changes" : "＋ Add prompt"}
            </Button>
          </div>
        </div>
      </div>

      {prompts.length === 0 ? (
        <EmptyState
          icon="💬"
          title="No private prompts yet"
          description="Prompts are optional — you can add them later from the setup wizard."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {prompts.map((prompt) => (
            <li
              key={prompt.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-outline-variant/50 bg-surface-container-lowest p-4"
            >
              <div>
                <p className="text-on-surface">{prompt.text}</p>
                <p className="mt-1 text-xs text-on-surface-variant">
                  {prompt.roundIndex !== undefined && prompt.roundIndex !== null
                    ? `Asked after Round ${Number(prompt.roundIndex) + 1}`
                    : "Asked at the end of the debate"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setText(prompt.text);
                    setRoundIndex(
                      prompt.roundIndex === undefined || prompt.roundIndex === null
                        ? ""
                        : String(prompt.roundIndex)
                    );
                    setEditingId(prompt.id);
                  }}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-error hover:bg-error-container"
                  onClick={() => deleteDoc(doc(promptsCol(debateId), prompt.id))}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
