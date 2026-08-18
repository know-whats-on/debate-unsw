"use client";

import { useState } from "react";
import { serverTimestamp, updateDoc } from "firebase/firestore";
import { debateDoc } from "@/lib/firebase/firestore";
import type { Debate, Round } from "@/types";
import {
  SETTING_HINTS,
  SETTING_KEYS,
  SETTING_LABELS,
  isOverridden,
  resolveEffectiveSettings,
  settingsDefaultsOf,
  type SettingKey,
} from "@/lib/debate/settings";
import {
  sendAnnouncement,
  setDebateDefault,
  setRoundSetting,
  toggleDebateSetting,
} from "@/lib/debate/controls";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";

const DEBATE_WIDE: { field: "reflectionsEnabled" | "autoStartRounds" | "timerStartsWithRound"; label: string; hint: string }[] = [
  { field: "reflectionsEnabled", label: "Reflections", hint: "Students can submit private reflections." },
  { field: "autoStartRounds", label: "Auto progression", hint: "Move to the next phase when the timer runs out." },
  { field: "timerStartsWithRound", label: "Timer starts with round", hint: "Off: a new round's clock waits for you to press start." },
];

export function SettingsCard({
  debate,
  rounds,
}: {
  debate: Debate;
  rounds: Round[];
}) {
  const [scope, setScope] = useState<"round" | "debate">("round");
  const [announcement, setAnnouncement] = useState("");
  const [sent, setSent] = useState(false);

  const currentRound = rounds.find((r) => r.index === debate.currentRoundIndex);
  const effective = resolveEffectiveSettings(debate, currentRound);
  const defaults = settingsDefaultsOf(debate);
  const roundScope = scope === "round" && !!currentRound;
  const roundLabel = `R${debate.currentRoundIndex + 1}`;

  return (
    <Card>
      <CardHeader className="flex-col items-stretch gap-2">
        <CardTitle>Session settings</CardTitle>
        <Tabs
          value={scope}
          onValueChange={setScope}
          tabs={[
            { value: "round" as const, label: `This round (${roundLabel})` },
            { value: "debate" as const, label: "Whole debate" },
          ]}
        />
        <p className="text-xs text-on-surface-variant">
          {roundScope
            ? `Applies to ${roundLabel} only — the next round returns to your debate defaults.`
            : "Your defaults for every round that doesn't override them."}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-3">
          {SETTING_KEYS.map((key) => {
            const overridden = roundScope && isOverridden(currentRound, key);
            const checked = roundScope ? effective[key] : defaults[key];
            return (
              <li key={key} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label htmlFor={`set-${key}`} className="text-sm text-on-surface">
                      {SETTING_LABELS[key]}
                    </label>
                    {overridden && (
                      <Badge tone="warning" className="text-[10px]">
                        Overridden
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-on-surface-variant">{SETTING_HINTS[key]}</p>
                  {overridden && (
                    <button
                      type="button"
                      onClick={() =>
                        setRoundSetting(debate, rounds, debate.currentRoundIndex, key, "inherit")
                      }
                      className="mt-0.5 text-xs font-medium text-primary hover:underline"
                    >
                      Reset to debate default ({defaults[key] ? "on" : "off"})
                    </button>
                  )}
                </div>
                <Switch
                  id={`set-${key}`}
                  checked={checked}
                  label={SETTING_LABELS[key]}
                  onCheckedChange={(v) =>
                    roundScope
                      ? setRoundSetting(debate, rounds, debate.currentRoundIndex, key, v)
                      : setDebateDefault(debate, rounds, key, v)
                  }
                />
              </li>
            );
          })}
        </ul>

        {roundScope && (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={async () => {
              for (const key of SETTING_KEYS) {
                await setDebateDefault(debate, rounds, key, effective[key]);
                if (isOverridden(currentRound, key)) {
                  await setRoundSetting(
                    debate,
                    rounds,
                    debate.currentRoundIndex,
                    key,
                    "inherit"
                  );
                }
              }
            }}
          >
            Apply {roundLabel} to the rest of the debate
          </Button>
        )}

        {/* Debate-wide only — never per round */}
        <div className="flex flex-col gap-3 border-t border-outline-variant/50 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            Whole debate
          </p>
          {DEBATE_WIDE.map((s) => (
            <div key={s.field} className="flex items-start justify-between gap-3">
              <div>
                <label htmlFor={`dw-${s.field}`} className="text-sm text-on-surface">
                  {s.label}
                </label>
                <p className="text-xs text-on-surface-variant">{s.hint}</p>
              </div>
              <Switch
                id={`dw-${s.field}`}
                checked={
                  s.field === "timerStartsWithRound"
                    ? debate.timerStartsWithRound !== false
                    : debate[s.field]
                }
                label={s.label}
                onCheckedChange={(v) => toggleDebateSetting(debate.id, s.field, v)}
              />
            </div>
          ))}
          <LimitRow
            label="Votes per round"
            hint="How many times a student may vote or change their vote in a round."
            value={debate.maxVotesPerRound}
            onSave={(n) => updateDoc(debateDoc(debate.id), { maxVotesPerRound: n, updatedAt: serverTimestamp() } as never)}
          />
          <LimitRow
            label="Likes per round"
            hint="How many comments a student may like in a round. Reactions are never limited."
            value={debate.maxLikesPerRound}
            onSave={(n) => updateDoc(debateDoc(debate.id), { maxLikesPerRound: n, updatedAt: serverTimestamp() } as never)}
          />
        </div>

        <div className="border-t border-outline-variant/50 pt-4">
          <p className="mb-2 text-sm font-medium text-on-surface">
            📣 Announcement to the room
          </p>
          <div className="flex gap-2">
            <Input
              aria-label="Announcement text"
              placeholder="Please focus comments on evidence…"
              maxLength={140}
              value={announcement}
              onChange={(e) => setAnnouncement(e.target.value)}
            />
            <Button
              disabled={!announcement.trim()}
              onClick={async () => {
                await sendAnnouncement(debate.id, announcement);
                setAnnouncement("");
                setSent(true);
                setTimeout(() => setSent(false), 2000);
              }}
            >
              {sent ? "✓ Sent" : "Send"}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-on-surface-variant">
            Shows as a banner on student screens and the public display for a
            minute.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

/** Numeric limit with a blank = unlimited convention. */
function LimitRow({
  label,
  hint,
  value,
  onSave,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  onSave: (value: number) => void | Promise<unknown>;
}) {
  const [draft, setDraft] = useState(value && value > 0 ? String(value) : "");

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <label htmlFor={`limit-${label}`} className="text-sm text-on-surface">
          {label}
        </label>
        <p className="text-xs text-on-surface-variant">{hint}</p>
        <p className={cn("text-xs font-medium", draft ? "text-primary" : "text-on-surface-variant")}>
          {draft ? `Limit ${draft} per round` : "Unlimited"}
        </p>
      </div>
      <Input
        id={`limit-${label}`}
        type="number"
        min={0}
        placeholder="∞"
        className="h-9 w-20 shrink-0 text-center"
        value={draft}
        onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
        onBlur={() => onSave(draft ? Number(draft) : 0)}
      />
    </div>
  );
}
