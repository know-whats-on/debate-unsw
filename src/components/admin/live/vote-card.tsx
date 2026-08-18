"use client";

import type { Debate, Vote } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function VoteCard({ debate, votes }: { debate: Debate; votes: Vote[] }) {
  const forCount = votes.filter((v) => v.side === "for").length;
  const againstCount = votes.length - forCount;
  const total = votes.length;
  const forPct = total === 0 ? 0 : Math.round((forCount / total) * 100);
  const againstPct = total === 0 ? 0 : 100 - forPct;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Live room support</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {total === 0 ? (
          <p className="py-4 text-center text-sm text-on-surface-variant">
            Waiting for votes…
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-primary p-4 text-on-primary">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                  {debate.forLabel}
                </p>
                <p className="font-display text-4xl font-extrabold">{forPct}%</p>
                <p className="text-sm opacity-90">{forCount} votes</p>
              </div>
              <div className="rounded-xl bg-secondary p-4 text-on-secondary">
                <p className="text-xs font-semibold uppercase tracking-wider opacity-80">
                  {debate.againstLabel}
                </p>
                <p className="font-display text-4xl font-extrabold">{againstPct}%</p>
                <p className="text-sm opacity-90">{againstCount} votes</p>
              </div>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-surface-container-high">
              <div
                className="bg-primary transition-all duration-700"
                style={{ width: `${forPct}%` }}
              />
              <div
                className="bg-secondary transition-all duration-700"
                style={{ width: `${againstPct}%` }}
              />
            </div>
            <p className="text-center text-xs text-on-surface-variant">
              {total} total votes
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
