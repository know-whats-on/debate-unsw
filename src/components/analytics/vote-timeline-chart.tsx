"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Debate, VoteEvent } from "@/types";

/** Replays voteEvents to chart room support over the debate (PRD §12.2). */
export function VoteTimelineChart({
  debate,
  voteEvents,
}: {
  debate: Debate;
  voteEvents: VoteEvent[];
}) {
  const data = useMemo(() => {
    const sorted = [...voteEvents].sort(
      (a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0)
    );
    const current = new Map<string, "for" | "against">();
    let forCount = 0;
    let againstCount = 0;
    const points: { label: string; [key: string]: string | number }[] = [];

    sorted.forEach((event, i) => {
      const prev = current.get(event.studentDocId);
      if (prev === "for") forCount--;
      if (prev === "against") againstCount--;
      current.set(event.studentDocId, event.side);
      if (event.side === "for") forCount++;
      else againstCount++;

      points.push({
        label: `R${event.roundIndex + 1} · #${i + 1}`,
        [debate.forLabel]: forCount,
        [debate.againstLabel]: againstCount,
      });
    });
    return points;
  }, [voteEvents, debate.forLabel, debate.againstLabel]);

  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-on-surface-variant">
        No votes were cast during this debate.
      </p>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#c7c4d7" opacity={0.5} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#464554" }}
            interval="preserveStartEnd"
            minTickGap={40}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#464554" }} />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey={debate.forLabel}
            stroke="#4648d4"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey={debate.againstLabel}
            stroke="#dc2c4f"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
