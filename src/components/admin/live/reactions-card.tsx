"use client";

import { REACTION_EMOJI, type Reaction, type ReactionType } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ReactionsCard({ reactions }: { reactions: Reaction[] }) {
  const counts = new Map<ReactionType, number>();
  for (const r of reactions) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const perMinute = reactions.filter(
    (r) => r.createdAt && Date.now() - r.createdAt.toMillis() < 60_000
  ).length;
  const intensity =
    perMinute >= 20 ? "High" : perMinute >= 6 ? "Medium" : perMinute > 0 ? "Low" : "Quiet";

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Reactions</CardTitle>
        <Badge tone={intensity === "High" ? "warning" : "neutral"}>
          {intensity} energy
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-4xl font-bold text-accent-flame">
            {reactions.length}
          </span>
          <span className="text-on-surface-variant">total reactions</span>
        </div>
        {sorted.length === 0 ? (
          <p className="text-sm text-on-surface-variant">
            No reactions yet — the grid is one tap away for students.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sorted.map(([type, count]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3 py-1.5 text-sm font-semibold text-on-surface"
              >
                <span className="text-lg">{REACTION_EMOJI[type]}</span>
                {count}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
