import { deleteField, type FieldValue } from "firebase/firestore";
import type { Debate, Round, RoundSettings } from "@/types";

/**
 * Participation settings live in two places:
 *
 *   debate.settingsDefaults   the instructor's debate-wide baseline
 *   round.settings            per-round overrides (a missing key inherits)
 *
 * and are projected onto the debate document's top-level booleans, which are
 * the *effective* values that Firestore rules (`debateData(debateId).xxx`)
 * and every client component read. Keeping that projection means neither the
 * rules nor the audience components need to know rounds exist.
 *
 * Those top-level booleans therefore have exactly ONE writer: `settingsPatch`
 * below, spread into the same updateDoc as each round transition. Anything
 * that writes them directly will be silently reverted at the next transition.
 */

export const SETTING_KEYS = [
  "votingEnabled",
  "commentsEnabled",
  "reactionsEnabled",
  "publicCommentsEnabled",
  "commentsGatedUntilPosted",
  "forceAnonymousComments",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_LABELS: Record<SettingKey, string> = {
  votingEnabled: "Voting",
  commentsEnabled: "Comments",
  reactionsEnabled: "Reactions",
  publicCommentsEnabled: "Comments on public display",
  commentsGatedUntilPosted: "Comment before reading others",
  forceAnonymousComments: "All comments anonymous",
};

export const SETTING_HINTS: Record<SettingKey, string> = {
  votingEnabled: "Students can cast and change their vote.",
  commentsEnabled: "Students can post comments and replies.",
  reactionsEnabled: "Students can send emoji reactions.",
  publicCommentsEnabled: "Comments appear on the projector screen.",
  commentsGatedUntilPosted:
    "A student must post in this round before they can read the round's feed.",
  forceAnonymousComments:
    "Hides comment authors from other students. You still see who wrote what.",
};

/** Falsey-safe: treats null (from a cleared field) the same as absent. */
function isSet(value: boolean | null | undefined): value is boolean {
  return value === true || value === false;
}

/**
 * The instructor's baseline. Legacy debates have no `settingsDefaults`, so we
 * resolve it from the current top-level booleans rather than migrating data.
 */
export function settingsDefaultsOf(debate: Debate): RoundSettings {
  const stored = debate.settingsDefaults;
  return {
    votingEnabled: isSet(stored?.votingEnabled) ? stored.votingEnabled : debate.votingEnabled,
    commentsEnabled: isSet(stored?.commentsEnabled)
      ? stored.commentsEnabled
      : debate.commentsEnabled,
    reactionsEnabled: isSet(stored?.reactionsEnabled)
      ? stored.reactionsEnabled
      : debate.reactionsEnabled,
    publicCommentsEnabled: isSet(stored?.publicCommentsEnabled)
      ? stored.publicCommentsEnabled
      : debate.publicCommentsEnabled,
    commentsGatedUntilPosted: isSet(stored?.commentsGatedUntilPosted)
      ? stored.commentsGatedUntilPosted
      : debate.commentsGatedUntilPosted ?? false,
    forceAnonymousComments: isSet(stored?.forceAnonymousComments)
      ? stored.forceAnonymousComments
      : debate.forceAnonymousComments ?? false,
  };
}

/** Baseline overlaid with a round's overrides. */
export function resolveEffectiveSettings(
  debate: Debate,
  round: Round | undefined
): RoundSettings {
  const defaults = settingsDefaultsOf(debate);
  if (!round?.settings) return defaults;
  const out = { ...defaults };
  for (const key of SETTING_KEYS) {
    const override = round.settings[key];
    if (isSet(override)) out[key] = override;
  }
  return out;
}

/**
 * The debate-doc patch that makes `round` the live one. Spread into the SAME
 * updateDoc as the transition — a follow-up write would leave a window where
 * the next round is live under the previous round's permissions.
 *
 * Always writes every key explicitly: omitting a key would let a previous
 * round's override stick on a round that inherits.
 */
export function settingsPatch(
  debate: Debate,
  round: Round | undefined
): Record<SettingKey, boolean> {
  return resolveEffectiveSettings(debate, round);
}

/** Ends the debate on the baseline, so a final round's overrides can't
 *  linger over the reflection window. */
export function defaultsPatch(debate: Debate): Record<SettingKey, boolean> {
  return settingsDefaultsOf(debate);
}

/**
 * Writing a per-round override on a legacy debate would otherwise leak: the
 * next transition resolves the baseline from the top-level booleans, which by
 * then hold the override. Persist the baseline alongside any override write.
 */
export function ensureDefaultsPatch(debate: Debate): Record<string, boolean> {
  if (debate.settingsDefaults) return {};
  const defaults = settingsDefaultsOf(debate);
  return Object.fromEntries(
    SETTING_KEYS.map((key) => [`settingsDefaults.${key}`, defaults[key]])
  );
}

/** Firestore patch for one round override; `"inherit"` removes it. */
export function roundOverridePatch(
  key: SettingKey,
  value: boolean | "inherit"
): Record<string, boolean | FieldValue> {
  return {
    [`settings.${key}`]: value === "inherit" ? deleteField() : value,
  };
}

/** Whether a round explicitly overrides a setting (vs inheriting it). */
export function isOverridden(round: Round | undefined, key: SettingKey): boolean {
  return isSet(round?.settings?.[key]);
}
