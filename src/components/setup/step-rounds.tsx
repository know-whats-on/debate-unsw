"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getDocs, serverTimestamp, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { debateDoc, promptsCol, roundsCol } from "@/lib/firebase/firestore";
import {
  DEFAULT_ROUNDS,
  MAX_ROUND_SECONDS,
  MIN_ROUNDS,
  MIN_ROUND_SECONDS,
  estimatedTotalSeconds,
  formatDuration,
  newUid,
  type RoundDraftRow,
} from "@/lib/debate/defaults";
import {
  SETTING_HINTS,
  SETTING_KEYS,
  SETTING_LABELS,
  type SettingKey,
} from "@/lib/debate/settings";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import { StepShell, type StepProps } from "./shared";

export function StepRounds({
  debateId,
  debate,
  rounds,
  prompts,
  onNext,
  onBack,
}: StepProps) {
  const [drafts, setDrafts] = useState<RoundDraftRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [autoStart, setAutoStart] = useState(debate.autoStartRounds);
  const [timerStarts, setTimerStarts] = useState(
    debate.timerStartsWithRound !== false
  );
  const [maxVotes, setMaxVotes] = useState(
    debate.maxVotesPerRound ? String(debate.maxVotesPerRound) : ""
  );
  const [maxLikes, setMaxLikes] = useState(
    debate.maxLikesPerRound ? String(debate.maxLikesPerRound) : ""
  );
  const [openSettings, setOpenSettings] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const dragFrom = useRef<number | null>(null);

  // Structural edits repoint every roundIndex-keyed record (comments, votes,
  // reactions), so they are only safe before the debate has run.
  const locked = debate.status !== "draft" && debate.status !== "ready";

  useEffect(() => {
    if (loaded) return;
    if (rounds.length > 0) {
      setDrafts(
        rounds.map((r, i) => ({
          uid: newUid(),
          originalIndex: i,
          title: r.title,
          durationSeconds: r.durationSeconds,
          breakAfterEnabled: r.breakAfterEnabled,
          breakDurationSeconds: r.breakDurationSeconds ?? 60,
          ...(r.settings ? { settings: { ...r.settings } } : {}),
        }))
      );
      setLoaded(true);
    } else if (rounds.length === 0) {
      setDrafts(DEFAULT_ROUNDS.map((r) => ({ ...r, uid: newUid() })));
      setLoaded(true);
    }
  }, [rounds, loaded]);

  function patch(index: number, changes: Partial<RoundDraftRow>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...changes } : d))
    );
  }

  function blank(title: string): RoundDraftRow {
    return {
      uid: newUid(),
      title,
      durationSeconds: 240,
      breakAfterEnabled: false,
      breakDurationSeconds: 60,
    };
  }

  function insertAt(index: number) {
    setDrafts((prev) => {
      const next = [...prev];
      next.splice(index, 0, blank(`Round ${prev.length + 1}`));
      return next;
    });
  }

  function move(from: number, to: number) {
    setDrafts((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  }

  /** One speech → two half-length speeches, one per team. */
  function splitIntoTeams(index: number) {
    setDrafts((prev) => {
      const row = prev[index];
      if (row.durationSeconds < MIN_ROUND_SECONDS * 2) return prev;
      // Snap to 30s so the halves stay editable in the 0.5-minute inputs,
      // and make them sum to the original.
      const half = Math.round(row.durationSeconds / 2 / 30) * 30;
      const first = Math.max(MIN_ROUND_SECONDS, half);
      const second = Math.max(MIN_ROUND_SECONDS, row.durationSeconds - first);
      const base = row.title.trim();
      const next = [...prev];
      next.splice(
        index,
        1,
        {
          ...row,
          uid: newUid(),
          title: `${base} — ${debate.forLabel}`,
          durationSeconds: first,
          // The break belonged after the whole speech, so it follows the
          // second half — not the seam in the middle.
          breakAfterEnabled: false,
        },
        {
          ...row,
          uid: newUid(),
          originalIndex: undefined,
          title: `${base} — ${debate.againstLabel}`,
          durationSeconds: second,
          breakAfterEnabled: row.breakAfterEnabled,
        }
      );
      return next;
    });
  }

  function setRoundOverride(
    index: number,
    key: SettingKey,
    value: boolean | "inherit"
  ) {
    setDrafts((prev) =>
      prev.map((d, i) => {
        if (i !== index) return d;
        const settings = { ...(d.settings ?? {}) };
        if (value === "inherit") delete settings[key];
        else settings[key] = value;
        return { ...d, settings };
      })
    );
  }

  /** Prompts that would be orphaned by deleting this round. */
  function promptsForRound(index: number) {
    const original = drafts[index]?.originalIndex;
    if (typeof original !== "number") return [];
    return prompts.filter((p) => p.roundIndex === original);
  }

  async function save() {
    for (const [i, d] of drafts.entries()) {
      if (!d.title.trim()) {
        setError(`Round ${i + 1} needs a title.`);
        return;
      }
      if (
        d.durationSeconds < MIN_ROUND_SECONDS ||
        d.durationSeconds > MAX_ROUND_SECONDS
      ) {
        setError(`Round ${i + 1} must be between 30 seconds and 30 minutes.`);
        return;
      }
    }
    setError(null);
    setBusy(true);
    try {
      const batch = writeBatch(db());

      // Rounds are replaced wholesale — array order is the source of truth.
      const existing = await getDocs(roundsCol(debateId));
      existing.docs.forEach((d) => batch.delete(d.ref));
      drafts.forEach((d, index) => {
        batch.set(doc(roundsCol(debateId)), {
          debateId,
          index,
          title: d.title.trim(),
          durationSeconds: d.durationSeconds,
          breakAfterEnabled: d.breakAfterEnabled,
          breakDurationSeconds: d.breakDurationSeconds,
          ...(d.settings && Object.keys(d.settings).length > 0
            ? { settings: d.settings }
            : {}),
          status: "not_started",
        } as never);
      });

      // Prompts point at rounds by numeric index, so reordering/splitting
      // would silently repoint them. Follow each round to its new position.
      const remap = new Map<number, number>();
      drafts.forEach((d, index) => {
        if (typeof d.originalIndex === "number" && !remap.has(d.originalIndex)) {
          remap.set(d.originalIndex, index);
        }
      });
      for (const prompt of prompts) {
        if (typeof prompt.roundIndex !== "number") continue;
        const target = remap.get(prompt.roundIndex);
        if (target === undefined) {
          // Its round was deleted — drop the prompt rather than silently
          // promoting it to "whole debate" / "end of debate".
          batch.delete(doc(promptsCol(debateId), prompt.id));
        } else if (target !== prompt.roundIndex) {
          batch.update(doc(promptsCol(debateId), prompt.id), {
            roundIndex: target,
          } as never);
        }
      }

      batch.update(debateDoc(debateId), {
        autoStartRounds: autoStart,
        timerStartsWithRound: timerStarts,
        maxVotesPerRound: maxVotes ? Number(maxVotes) : 0,
        maxLikesPerRound: maxLikes ? Number(maxLikes) : 0,
        updatedAt: serverTimestamp(),
      } as never);

      await batch.commit();

      // Re-anchor so a second save doesn't remap prompts twice.
      setDrafts((prev) => prev.map((d, i) => ({ ...d, originalIndex: i })));
      onNext();
    } catch {
      setError("Something went wrong saving rounds. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const total = estimatedTotalSeconds(drafts);
  const doomedPrompts = useMemo(
    () => (pendingDelete === null ? [] : promptsForRound(pendingDelete)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pendingDelete, drafts, prompts]
  );

  return (
    <StepShell
      title="Rounds + Breaks"
      description="Configure the sequence of your debate — speaking rounds, breaks and total duration."
      onNext={save}
      onBack={onBack}
      busy={busy}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary p-5 text-on-primary shadow-raised">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
            Estimated time
          </p>
          <p className="font-display text-3xl font-bold">{formatDuration(total)}</p>
        </div>
        <div className="text-right text-sm">
          <p>
            {drafts.length} round{drafts.length === 1 ? "" : "s"}:{" "}
            <strong>
              {formatDuration(drafts.reduce((t, d) => t + d.durationSeconds, 0))}
            </strong>
          </p>
          <p>
            Breaks:{" "}
            <strong>
              {formatDuration(
                drafts.reduce(
                  (t, d) => t + (d.breakAfterEnabled ? d.breakDurationSeconds : 0),
                  0
                )
              )}
            </strong>
          </p>
        </div>
      </div>

      {locked && (
        <p className="rounded-lg bg-accent-amber/15 px-4 py-3 text-sm text-on-surface">
          This debate has already run, so rounds can&apos;t be reordered, added
          or removed — students&apos; comments and votes are recorded against
          the current round numbers. You can still rename rounds and adjust
          their length.
        </p>
      )}

      <ol className="flex flex-col gap-2">
        {drafts.map((draft, i) => (
          <li key={draft.uid}>
            {!locked && <InsertRow onClick={() => insertAt(i)} />}
            <div
              draggable={!locked}
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom.current !== null) move(dragFrom.current, i);
                dragFrom.current = null;
              }}
              className="rounded-xl border border-outline-variant/60 bg-surface-container-low p-4"
            >
              <div className="flex flex-wrap items-end gap-3">
                {!locked && (
                  <div className="flex flex-col">
                    <button
                      type="button"
                      aria-label={`Move round ${i + 1} up`}
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                      className="h-5 rounded text-xs text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      aria-label={`Move round ${i + 1} down`}
                      disabled={i === drafts.length - 1}
                      onClick={() => move(i, i + 1)}
                      className="h-5 rounded text-xs text-on-surface-variant hover:bg-surface-container disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>
                )}
                <span
                  title={locked ? undefined : "Drag to reorder"}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 font-display font-bold text-primary",
                    !locked && "cursor-grab active:cursor-grabbing"
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-40 flex-1">
                  <Label htmlFor={`round-title-${draft.uid}`}>Round title</Label>
                  <Input
                    id={`round-title-${draft.uid}`}
                    value={draft.title}
                    onChange={(e) => patch(i, { title: e.target.value })}
                  />
                </div>
                <div className="w-28">
                  <Label htmlFor={`round-mins-${draft.uid}`}>Minutes</Label>
                  <Input
                    id={`round-mins-${draft.uid}`}
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={draft.durationSeconds / 60}
                    onChange={(e) =>
                      patch(i, {
                        durationSeconds: Math.round(Number(e.target.value) * 60),
                      })
                    }
                  />
                </div>
                {!locked && drafts.length > MIN_ROUNDS && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove round ${i + 1}`}
                    onClick={() => setPendingDelete(i)}
                    className="text-error hover:bg-error-container"
                  >
                    ✕
                  </Button>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-outline-variant/40 pt-3">
                <div className="flex items-center gap-2">
                  <Switch
                    id={`break-${draft.uid}`}
                    checked={draft.breakAfterEnabled}
                    onCheckedChange={(v) => patch(i, { breakAfterEnabled: v })}
                    label={`Break after round ${i + 1}`}
                  />
                  <label htmlFor={`break-${draft.uid}`} className="text-sm text-on-surface">
                    Break after this round
                  </label>
                </div>
                {draft.breakAfterEnabled && (
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`break-mins-${draft.uid}`} className="mb-0">
                      Break minutes
                    </Label>
                    <Input
                      id={`break-mins-${draft.uid}`}
                      type="number"
                      min={0.5}
                      max={15}
                      step={0.5}
                      className="w-24"
                      value={draft.breakDurationSeconds / 60}
                      onChange={(e) =>
                        patch(i, {
                          breakDurationSeconds: Math.round(
                            Number(e.target.value) * 60
                          ),
                        })
                      }
                    />
                  </div>
                )}

                {!locked && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={draft.durationSeconds < MIN_ROUND_SECONDS * 2}
                    title={
                      draft.durationSeconds < MIN_ROUND_SECONDS * 2
                        ? "Needs at least 1 minute to split into two 30-second halves"
                        : `Split into ${debate.forLabel} and ${debate.againstLabel} halves`
                    }
                    onClick={() => splitIntoTeams(i)}
                  >
                    ⇄ Split into 2 teams
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setOpenSettings(openSettings === draft.uid ? null : draft.uid)
                  }
                  className="ml-auto text-sm font-medium text-primary hover:underline"
                >
                  {openSettings === draft.uid ? "Hide" : "Round settings"}
                  {draft.settings && Object.keys(draft.settings).length > 0 && (
                    <span className="ml-1 rounded-full bg-accent-amber/25 px-1.5 py-0.5 text-[10px] font-bold text-on-surface">
                      {Object.keys(draft.settings).length}
                    </span>
                  )}
                </button>
              </div>

              {openSettings === draft.uid && (
                <div className="mt-3 flex flex-col gap-2 rounded-lg bg-surface-container-lowest p-3">
                  <p className="text-xs text-on-surface-variant">
                    Leave on <strong>Inherit</strong> to follow the debate-wide
                    setting. Overrides apply only while this round is live.
                  </p>
                  {SETTING_KEYS.map((key) => (
                    <div
                      key={key}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <div className="min-w-40 flex-1">
                        <p className="text-sm text-on-surface">{SETTING_LABELS[key]}</p>
                        <p className="text-xs text-on-surface-variant">
                          {SETTING_HINTS[key]}
                        </p>
                      </div>
                      <div className="flex gap-1" role="radiogroup" aria-label={SETTING_LABELS[key]}>
                        {(
                          [
                            ["inherit", "Inherit"],
                            [true, "On"],
                            [false, "Off"],
                          ] as [boolean | "inherit", string][]
                        ).map(([value, label]) => {
                          const current = draft.settings?.[key];
                          const selected =
                            value === "inherit"
                              ? current === undefined
                              : current === value;
                          return (
                            <button
                              key={label}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              onClick={() => setRoundOverride(i, key, value)}
                              className={cn(
                                "rounded-full px-2.5 py-1 text-xs font-semibold transition-colors",
                                selected
                                  ? "bg-primary text-on-primary"
                                  : "bg-surface-container text-on-surface-variant hover:text-on-surface"
                              )}
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {!locked && (
        <Button variant="outline" onClick={() => insertAt(drafts.length)} className="self-start">
          ＋ Add round
        </Button>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/50 p-4">
        <p className="text-sm font-semibold text-on-surface">Timing</p>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <Switch checked={autoStart} onCheckedChange={setAutoStart} label="Auto progression" />
          Auto-advance to the next round when the timer runs out
        </label>
        <label className="flex items-center gap-2 text-sm text-on-surface">
          <Switch
            checked={timerStarts}
            onCheckedChange={setTimerStarts}
            label="Timer starts with round"
          />
          Start each round&apos;s timer automatically
        </label>
        {!timerStarts && (
          <p className="text-xs text-on-surface-variant">
            Every screen will show the full time, frozen, until you press
            <strong> Start timer</strong> — useful when you want to introduce a
            speaker first.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-outline-variant/50 p-4">
        <p className="text-sm font-semibold text-on-surface">
          Participation limits{" "}
          <span className="font-normal text-on-surface-variant">
            — leave blank for unlimited
          </span>
        </p>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <Label htmlFor="max-votes" className="mb-0">
              Votes per round
            </Label>
            <Input
              id="max-votes"
              type="number"
              min={0}
              placeholder="∞"
              className="w-24 text-center"
              value={maxVotes}
              onChange={(e) => setMaxVotes(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="max-likes" className="mb-0">
              Likes per round
            </Label>
            <Input
              id="max-likes"
              type="number"
              min={0}
              placeholder="∞"
              className="w-24 text-center"
              value={maxLikes}
              onChange={(e) => setMaxLikes(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
        </div>
        <p className="text-xs text-on-surface-variant">
          Students see how many votes they have left each round. Emoji
          reactions are never limited.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
          {error}
        </p>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete !== null) {
            setDrafts((prev) => prev.filter((_, i) => i !== pendingDelete));
          }
        }}
        title={`Remove round ${(pendingDelete ?? 0) + 1}?`}
        description={
          doomedPrompts.length > 0
            ? `This also deletes ${doomedPrompts.length} prompt${
                doomedPrompts.length === 1 ? "" : "s"
              } written for this round: ${doomedPrompts
                .map((p) => `“${p.text.slice(0, 40)}”`)
                .join(", ")}`
            : "The remaining rounds will be renumbered."
        }
        confirmLabel="Remove round"
        destructive
      />
    </StepShell>
  );
}

/** Thin "insert a round here" affordance between two cards. */
function InsertRow({ onClick }: { onClick: () => void }) {
  return (
    <div className="group flex h-5 items-center justify-center">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-2 opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
      >
        <span className="h-px flex-1 bg-primary/30" />
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
          ＋ Insert round
        </span>
        <span className="h-px flex-1 bg-primary/30" />
      </button>
    </div>
  );
}
