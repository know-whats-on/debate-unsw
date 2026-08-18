"use client";

import { useState, type ReactNode } from "react";
import { useAuthedFetch } from "@/components/auth-provider";
import type { AnalyticsSummary } from "@/types";
import { parseLiteBlocks } from "@/lib/markdown/lite";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";

export function AiSummaryCard({
  debateId,
  summary,
}: {
  debateId: string;
  summary: AnalyticsSummary | null;
}) {
  const authedFetch = useAuthedFetch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await authedFetch("/api/ai/debate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debateId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "server_error");
      }
      // Firestore listener on analyticsSummaries refreshes the card
    } catch {
      setError(
        "We could not generate the AI summary. Check the Anthropic API key and try again."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>✨ Claude engagement summary</CardTitle>
          <CardDescription>
            Instructor-facing analysis of themes, engagement and support shifts.
            It never grades or ranks students.
          </CardDescription>
        </div>
        <Button onClick={generate} disabled={busy}>
          {busy ? (
            <>
              <Spinner className="h-4 w-4 border-on-primary/40 border-t-on-primary" />
              Generating…
            </>
          ) : summary ? (
            "Regenerate"
          ) : (
            "Generate summary"
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <p role="alert" className="mb-4 rounded-lg bg-error-container px-3 py-2 text-sm text-on-error-container">
            {error}
          </p>
        )}
        {!summary && !busy && !error && (
          <p className="py-6 text-center text-sm text-on-surface-variant">
            No AI summary yet. Generate one to get themes, high-engagement
            moments and follow-up discussion questions.
          </p>
        )}
        {summary && (
          <div className="flex flex-col gap-5">
            {summary.keyThemes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summary.keyThemes.map((theme) => (
                  <Badge key={theme} tone="primary">
                    {theme}
                  </Badge>
                ))}
              </div>
            )}
            <MarkdownLite text={summary.summary} />
            {summary.highEngagementMoments.length > 0 && (
              <div>
                <p className="mb-2 font-display font-semibold text-on-surface">
                  ⚡ High-engagement moments
                </p>
                <ul className="flex flex-col gap-2">
                  {summary.highEngagementMoments.map((moment, i) => (
                    <li
                      key={i}
                      className="rounded-lg border-l-4 border-accent-flame bg-accent-amber/10 px-4 py-2.5 text-sm"
                    >
                      <span className="font-semibold text-on-surface">
                        Round {moment.roundIndex + 1}: {moment.title}
                      </span>{" "}
                      <span className="text-on-surface-variant">
                        {moment.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {summary.recommendations && summary.recommendations.length > 0 && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                <p className="mb-1 font-semibold text-on-surface">
                  🎯 Recommendations for next time
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-on-surface-variant">
                  {summary.recommendations.map((rec) => (
                    <li key={rec}>{rec}</li>
                  ))}
                </ul>
              </div>
            )}
            {summary.limitations.length > 0 && (
              <div className="rounded-lg bg-surface-container-low p-4 text-sm text-on-surface-variant">
                <p className="mb-1 font-semibold text-on-surface">Cautions</p>
                <ul className="list-inside list-disc space-y-0.5">
                  {summary.limitations.map((limitation) => (
                    <li key={limitation}>{limitation}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Renders **bold** spans as real <strong> — never leaks literal asterisks. */
function renderInlineBold(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${keyPrefix}-${i}`} className="font-semibold text-on-surface">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={`${keyPrefix}-${i}`}>{part}</span>
      )
    );
}

/** Renders the summary's plain-markdown (### / - / **bold**) as clean prose. */
function MarkdownLite({ text }: { text: string }) {
  const blocks = parseLiteBlocks(text);
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed text-on-surface">
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="mt-3 font-display text-base font-semibold">
              {renderInlineBold(block.text, `h${i}`)}
            </p>
          );
        }
        if (block.type === "bullet") {
          return (
            <p key={i} className="pl-4">
              • {renderInlineBold(block.text, `b${i}`)}
            </p>
          );
        }
        return <p key={i}>{renderInlineBold(block.text, `p${i}`)}</p>;
      })}
    </div>
  );
}
