"use client";

import { cn } from "@/lib/utils/cn";

export function SupportBar({
  forCount,
  againstCount,
  forLabel,
  againstLabel,
  dark = false,
}: {
  forCount: number;
  againstCount: number;
  forLabel: string;
  againstLabel: string;
  dark?: boolean;
}) {
  const total = forCount + againstCount;
  const forPct = total === 0 ? 50 : Math.round((forCount / total) * 100);
  const againstPct = total === 0 ? 50 : 100 - forPct;

  return (
    <div aria-label={`Room support: ${forPct}% ${forLabel}, ${againstPct}% ${againstLabel}`}>
      <div className="flex items-baseline justify-between text-sm font-semibold">
        <span className={dark ? "text-inverse-primary" : "text-primary"}>
          {forLabel} {total > 0 && `${forPct}%`}
        </span>
        <span className={dark ? "text-secondary-fixed-dim" : "text-secondary"}>
          {total > 0 && `${againstPct}%`} {againstLabel}
        </span>
      </div>
      <div
        className={cn(
          "mt-1 flex h-2.5 overflow-hidden rounded-full",
          dark ? "bg-surface-container-high" : "bg-surface-container-high"
        )}
      >
        {total === 0 ? (
          <div className="w-full bg-outline-variant/40" />
        ) : (
          <>
            <div
              className="bg-primary transition-all duration-700"
              style={{ width: `${forPct}%` }}
            />
            <div
              className="bg-secondary transition-all duration-700"
              style={{ width: `${againstPct}%` }}
            />
          </>
        )}
      </div>
      <p className="mt-1 text-xs text-on-surface-variant">
        {total === 0 ? "Waiting for votes…" : `${total} vote${total === 1 ? "" : "s"}`}
      </p>
    </div>
  );
}
