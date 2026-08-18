import type { Debate, Prompt } from "@/types";

export const DEFAULT_END_PROMPT =
  "What did you find most convincing in this debate, and why?";

export interface AvailablePrompt {
  /** Firestore doc id to write the response to. */
  responseDocId: (studentDocId: string) => string;
  promptId?: string;
  roundIndex?: number;
  text: string;
  /** "After Round 2" / "End of debate" chip. */
  label: string;
}

/**
 * Which private reflection prompts a student can currently answer.
 * Round prompts unlock once their round has finished (break, later round,
 * or the debate ending). General prompts unlock when the debate ends.
 */
export function availableReflectionPrompts(
  debate: Debate,
  prompts: Prompt[]
): AvailablePrompt[] {
  const ended = debate.status === "ended";
  const reflectionPrompts = prompts
    .filter((p) => p.type === "private_reflection_prompt")
    .sort((a, b) => a.order - b.order);

  const available: AvailablePrompt[] = [];

  for (const prompt of reflectionPrompts) {
    const roundIndex = prompt.roundIndex;
    if (roundIndex === undefined || roundIndex === null) {
      if (!ended) continue;
      available.push({
        responseDocId: (sid) => `${sid}__${prompt.id}`,
        promptId: prompt.id,
        text: prompt.text,
        label: "End of debate",
      });
      continue;
    }
    const roundDone =
      ended ||
      debate.currentRoundIndex > roundIndex ||
      (debate.currentRoundIndex === roundIndex && debate.currentPhase === "break");
    if (!roundDone) continue;
    available.push({
      responseDocId: (sid) => `${sid}__${prompt.id}`,
      promptId: prompt.id,
      roundIndex,
      text: prompt.text,
      label: `After Round ${roundIndex + 1}`,
    });
  }

  // No instructor-written end prompt? Offer the default one after the debate.
  if (ended && !reflectionPrompts.some((p) => p.roundIndex === undefined || p.roundIndex === null)) {
    available.push({
      responseDocId: (sid) => sid,
      text: DEFAULT_END_PROMPT,
      label: "End of debate",
    });
  }

  return available;
}

/* ------------------------------------------------------------------
   Students can't read the reflections collection (it's instructor-only),
   so their own drafts/answers are cached locally for the editing UX.
------------------------------------------------------------------- */
const cacheKey = (debateId: string) => `digitaljury.reflections.${debateId}`;

export function loadAnswerCache(debateId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(cacheKey(debateId)) ?? "{}");
  } catch {
    return {};
  }
}

export function saveAnswerCache(debateId: string, docId: string, text: string) {
  if (typeof window === "undefined") return;
  const cache = loadAnswerCache(debateId);
  cache[docId] = text;
  localStorage.setItem(cacheKey(debateId), JSON.stringify(cache));
}
