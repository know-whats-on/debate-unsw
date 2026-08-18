import "server-only";
import Anthropic from "@anthropic-ai/sdk";

export interface DebateSummaryInput {
  topic: string;
  rounds: string;
  voteTimeline: string;
  comments: string;
  reflections: string;
}

export interface DebateSummaryResult {
  summary: string;
  keyThemes: string[];
  highEngagementMoments: {
    roundIndex: number;
    title: string;
    description: string;
  }[];
  suggestedInstructorNotes: string[];
  recommendations: string[];
  limitations: string[];
}

const PROMPT_TEMPLATE = `You are an education analytics assistant helping a university instructor understand student engagement during a classroom debate.

Do not grade students.
Do not make harsh claims about individual students.
Do not infer personal attributes.
Do not infer race, religion, politics, sexuality, disability, health, or any protected/sensitive traits.
Summarize only from the provided debate data.
If the data is sparse, clearly state that the analysis is limited.

Formatting rules (strict):
- Do not use markdown emphasis characters anywhere: no single or double asterisks (*, **) and no underscores for bold/italic.
- Only use "### " immediately before each of the 7 section titles below, and nowhere else.
- For list items, start the line with a single dash and a space ("- ").
- Write in plain, direct prose a busy instructor can skim in under two minutes.

Debate Topic:
{{topic}}

Rounds:
{{rounds}}

Vote Timeline:
{{voteTimeline}}

Public Comments:
{{comments}}

Private Reflections:
{{reflections}}

Create a concise instructor-facing engagement summary with the following sections:

1. What Happened
2. Strongest Audience Themes
3. Moments of High Engagement
4. Notable Shifts in Audience Support
5. Suggested Follow-Up Discussion Questions
6. Recommendations for Next Time — concrete, prioritized changes to how the instructor runs the next debate session (timing, prompts, participation tactics, format tweaks). This is operational advice for the instructor, distinct from discussion questions for students.
7. Cautions and Limitations

Respond with ONLY a JSON object (no markdown fences) with this exact shape:
{
  "summary": "plain text covering all seven sections with ### headings, no ** or other emphasis markers",
  "keyThemes": ["theme", ...],
  "highEngagementMoments": [{"roundIndex": 0, "title": "...", "description": "..."}],
  "suggestedInstructorNotes": ["follow-up question or note", ...],
  "recommendations": ["concrete change for next time", ...],
  "limitations": ["caution", ...]
}`;

export async function generateDebateSummary(
  input: DebateSummaryInput
): Promise<DebateSummaryResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = PROMPT_TEMPLATE.replace("{{topic}}", input.topic)
    .replace("{{rounds}}", input.rounds)
    .replace("{{voteTimeline}}", input.voteTimeline)
    .replace("{{comments}}", input.comments)
    .replace("{{reflections}}", input.reflections);

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 3500,
    messages: [{ role: "user", content: prompt }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    return {
      summary: String(parsed.summary ?? text),
      keyThemes: Array.isArray(parsed.keyThemes) ? parsed.keyThemes.map(String) : [],
      highEngagementMoments: Array.isArray(parsed.highEngagementMoments)
        ? parsed.highEngagementMoments.map(
            (m: { roundIndex?: number; title?: string; description?: string }) => ({
              roundIndex: Number(m.roundIndex ?? 0),
              title: String(m.title ?? ""),
              description: String(m.description ?? ""),
            })
          )
        : [],
      suggestedInstructorNotes: Array.isArray(parsed.suggestedInstructorNotes)
        ? parsed.suggestedInstructorNotes.map(String)
        : [],
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.map(String)
        : [],
      limitations: Array.isArray(parsed.limitations)
        ? parsed.limitations.map(String)
        : [],
    };
  } catch {
    // Model didn't return clean JSON — keep the prose so nothing is lost
    return {
      summary: text,
      keyThemes: [],
      highEngagementMoments: [],
      suggestedInstructorNotes: [],
      recommendations: [],
      limitations: [],
    };
  }
}
