import {
  doc,
  serverTimestamp,
  Timestamp,
  updateDoc,
  deleteField,
} from "firebase/firestore";
import { debateDoc, roundsCol } from "@/lib/firebase/firestore";
import {
  defaultsPatch,
  ensureDefaultsPatch,
  roundOverridePatch,
  settingsDefaultsOf as settingsDefaultsOfSafe,
  settingsPatch,
  type SettingKey,
} from "./settings";
import type { Debate, Round } from "@/types";

/**
 * Debate flow control — every transition writes shared timer state to the
 * debate doc (PRD §10.3) so all clients derive time locally. Pure Firestore
 * writes; a future server scheduler can call the same transitions.
 *
 * Every transition also projects the incoming round's effective participation
 * settings onto the debate doc in the SAME write (see ./settings.ts), so the
 * next round is never briefly live under the previous round's permissions.
 */

const roundAt = (rounds: Round[], index: number) =>
  rounds.find((r) => r.index === index);

/**
 * The timer block for entering a phase. When `timerStartsWithRound` is false
 * we omit `currentRoundStartedAt` entirely: timer.ts reads a missing value as
 * zero elapsed, so every screen shows the full duration frozen until the
 * instructor starts it, and round-controls' auto-advance guard already
 * ignores rounds that have not started.
 */
function timerBlock(debate: Debate, { force = false } = {}) {
  const armOnly = debate.timerStartsWithRound === false && !force;
  return {
    status: "live",
    ...(armOnly
      ? { currentRoundStartedAt: deleteField() }
      : { currentRoundStartedAt: serverTimestamp() }),
    currentRoundPausedAt: deleteField(),
    totalPausedMs: 0,
  };
}

async function setRoundStatus(
  debateId: string,
  rounds: Round[],
  index: number,
  status: Round["status"],
  extra: Record<string, unknown> = {}
) {
  const round = rounds.find((r) => r.index === index);
  if (!round) return;
  await updateDoc(doc(roundsCol(debateId), round.id), {
    status,
    ...extra,
  } as never);
}

export async function startDebate(debate: Debate, rounds: Round[]) {
  await updateDoc(debateDoc(debate.id), {
    ...timerBlock(debate, { force: true }), // explicit instructor action
    currentRoundIndex: 0,
    currentPhase: "round",
    ...settingsPatch(debate, roundAt(rounds, 0)),
    ...ensureDefaultsPatch(debate),
    updatedAt: serverTimestamp(),
  } as never);
  await setRoundStatus(debate.id, rounds, 0, "live", {
    startedAt: serverTimestamp(),
  });
}

/** Starts a round whose clock was armed but frozen (`timerStartsWithRound` off). */
export async function startRoundTimer(debate: Debate) {
  if (debate.currentRoundStartedAt) return;
  await updateDoc(debateDoc(debate.id), {
    status: "live",
    currentRoundStartedAt: serverTimestamp(),
    currentRoundPausedAt: deleteField(),
    totalPausedMs: 0,
    updatedAt: serverTimestamp(),
  } as never);
}

export async function pauseDebate(debate: Debate) {
  if (debate.status !== "live") return;
  await updateDoc(debateDoc(debate.id), {
    status: "paused",
    currentRoundPausedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never);
}

export async function resumeDebate(debate: Debate) {
  if (debate.status !== "paused") return;
  const pausedAt = debate.currentRoundPausedAt?.toMillis() ?? Date.now();
  const pausedFor = Math.max(0, Date.now() - pausedAt);
  await updateDoc(debateDoc(debate.id), {
    status: "live",
    totalPausedMs: (debate.totalPausedMs ?? 0) + pausedFor,
    currentRoundPausedAt: deleteField(),
    updatedAt: serverTimestamp(),
  } as never);
}

/** Moves to the next phase: round → its break (if any) → next round → … */
export async function advancePhase(debate: Debate, rounds: Round[]) {
  const round = rounds.find((r) => r.index === debate.currentRoundIndex);
  if (!round) return;
  const isLast = debate.currentRoundIndex >= rounds.length - 1;

  if (debate.currentPhase === "round" && round.breakAfterEnabled && !isLast) {
    // Enter this round's break
    await setRoundStatus(debate.id, rounds, round.index, "completed", {
      endedAt: serverTimestamp(),
    });
    await updateDoc(debateDoc(debate.id), {
      ...timerBlock(debate),
      currentPhase: "break",
      // A break is the tail of round N — currentRoundIndex is unchanged, and
      // comments written during it carry round N, so it keeps N's settings.
      ...settingsPatch(debate, round),
      updatedAt: serverTimestamp(),
    } as never);
    return;
  }

  if (isLast && debate.currentPhase === "round") {
    await endDebate(debate, rounds);
    return;
  }

  // Move to the next round
  if (debate.currentPhase === "round") {
    await setRoundStatus(debate.id, rounds, round.index, "completed", {
      endedAt: serverTimestamp(),
    });
  }
  const nextIndex = debate.currentRoundIndex + 1;
  await updateDoc(debateDoc(debate.id), {
    ...timerBlock(debate),
    currentRoundIndex: nextIndex,
    currentPhase: "round",
    ...settingsPatch(debate, roundAt(rounds, nextIndex)),
    updatedAt: serverTimestamp(),
  } as never);
  await setRoundStatus(debate.id, rounds, nextIndex, "live", {
    startedAt: serverTimestamp(),
  });
}

/** Returns to the previous round (requires confirmation upstream). */
export async function previousRound(debate: Debate, rounds: Round[]) {
  const prevIndex = Math.max(0, debate.currentRoundIndex - 1);
  await setRoundStatus(debate.id, rounds, debate.currentRoundIndex, "not_started");
  await updateDoc(debateDoc(debate.id), {
    ...timerBlock(debate),
    currentRoundIndex: prevIndex,
    currentPhase: "round",
    ...settingsPatch(debate, roundAt(rounds, prevIndex)),
    updatedAt: serverTimestamp(),
  } as never);
  await setRoundStatus(debate.id, rounds, prevIndex, "live", {
    startedAt: serverTimestamp(),
  });
}

export async function skipBreak(debate: Debate, rounds: Round[]) {
  if (debate.currentPhase !== "break") return;
  await advancePhase(debate, rounds);
}

export async function endDebate(debate: Debate, rounds: Round[]) {
  if (debate.currentPhase === "round") {
    await setRoundStatus(debate.id, rounds, debate.currentRoundIndex, "completed", {
      endedAt: serverTimestamp(),
    });
  }
  await updateDoc(debateDoc(debate.id), {
    status: "ended",
    currentRoundPausedAt: deleteField(),
    // Fall back to the debate-wide baseline: a final round that switched
    // comments off must not also switch off the reflection window.
    ...defaultsPatch(debate),
    endedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as never);
}

/**
 * Debate-wide settings that are NOT per-round overridable. These are written
 * directly because nothing recomputes them.
 */
export async function toggleDebateSetting(
  debateId: string,
  field: "reflectionsEnabled" | "autoStartRounds" | "timerStartsWithRound",
  value: boolean
) {
  await updateDoc(debateDoc(debateId), {
    [field]: value,
    updatedAt: serverTimestamp(),
  } as never);
}

/**
 * Sets the debate-wide baseline for an overridable setting, and re-projects
 * the effective value for the round that is live right now. Never write the
 * effective booleans directly — the next transition would revert them.
 */
export async function setDebateDefault(
  debate: Debate,
  rounds: Round[],
  field: SettingKey,
  value: boolean
) {
  const nextDebate: Debate = {
    ...debate,
    settingsDefaults: { ...settingsDefaultsOfSafe(debate), [field]: value },
  };
  await updateDoc(debateDoc(debate.id), {
    [`settingsDefaults.${field}`]: value,
    ...settingsPatch(nextDebate, roundAt(rounds, debate.currentRoundIndex)),
    updatedAt: serverTimestamp(),
  } as never);
}

/** Overrides (or clears, with `"inherit"`) one setting for a single round. */
export async function setRoundSetting(
  debate: Debate,
  rounds: Round[],
  roundIndex: number,
  field: SettingKey,
  value: boolean | "inherit"
) {
  const round = roundAt(rounds, roundIndex);
  if (!round) return;

  // Persist the baseline first, or on a legacy debate the next transition
  // would resolve defaults from the top-level booleans this override sets.
  const defaultsSeed = ensureDefaultsPatch(debate);
  if (Object.keys(defaultsSeed).length > 0) {
    await updateDoc(debateDoc(debate.id), defaultsSeed as never);
  }

  await updateDoc(
    doc(roundsCol(debate.id), round.id),
    roundOverridePatch(field, value) as never
  );

  // Re-project only if this is the round currently in play.
  if (roundIndex === debate.currentRoundIndex) {
    const nextSettings = { ...(round.settings ?? {}) };
    if (value === "inherit") delete nextSettings[field];
    else nextSettings[field] = value;
    await updateDoc(debateDoc(debate.id), {
      ...settingsPatch(debate, { ...round, settings: nextSettings }),
      updatedAt: serverTimestamp(),
    } as never);
  }
}

export async function sendAnnouncement(debateId: string, text: string) {
  await updateDoc(debateDoc(debateId), {
    announcement: { text: text.trim(), sentAt: Timestamp.now() },
    updatedAt: serverTimestamp(),
  } as never);
}
