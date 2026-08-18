import type { RoundSettings } from "@/types";

/** Default round configuration (PRD §7.5). */
export interface RoundDraft {
  title: string;
  durationSeconds: number;
  breakAfterEnabled: boolean;
  breakDurationSeconds: number;
  /** Per-round overrides; carried through the editor's save so they survive
   *  the delete-and-recreate persistence. */
  settings?: Partial<RoundSettings>;
}

/**
 * Editor-only wrapper. `uid` gives React a stable key across reorder/insert/
 * split (index keys mis-bind inputs the moment rows move); `originalIndex`
 * records where a round was loaded from so prompts can be remapped on save.
 */
export interface RoundDraftRow extends RoundDraft {
  uid: string;
  originalIndex?: number;
}

export const newUid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r${Math.random().toString(36).slice(2)}${Date.now()}`;

export const DEFAULT_ROUNDS: RoundDraft[] = [
  { title: "Opening Statements", durationSeconds: 240, breakAfterEnabled: true, breakDurationSeconds: 60 },
  { title: "Rebuttal", durationSeconds: 300, breakAfterEnabled: true, breakDurationSeconds: 60 },
  { title: "Cross Examination", durationSeconds: 300, breakAfterEnabled: true, breakDurationSeconds: 120 },
  { title: "Closing Arguments", durationSeconds: 240, breakAfterEnabled: false, breakDurationSeconds: 60 },
  { title: "Final Summary", durationSeconds: 180, breakAfterEnabled: false, breakDurationSeconds: 60 },
];

export const MIN_ROUNDS = 1;
// No upper bound on rounds — real debate formats run well past ten
// (INFS2604 uses seventeen).
export const MIN_ROUND_SECONDS = 30;
export const MAX_ROUND_SECONDS = 30 * 60;

export function estimatedTotalSeconds(rounds: RoundDraft[]): number {
  return rounds.reduce(
    (total, r) =>
      total +
      r.durationSeconds +
      (r.breakAfterEnabled ? r.breakDurationSeconds : 0),
    0
  );
}

export function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s}s`;
  if (s === 0) return `${m} min`;
  return `${m} min ${s}s`;
}

export function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
