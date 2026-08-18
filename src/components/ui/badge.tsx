import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type Tone =
  | "primary"
  | "secondary"
  | "neutral"
  | "success"
  | "warning"
  | "live";

const tones: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  secondary: "bg-secondary/10 text-secondary",
  neutral: "bg-on-surface/8 text-on-surface-variant",
  success: "bg-emerald-600/10 text-emerald-700",
  warning: "bg-accent-flame/15 text-accent-flame",
  live: "bg-secondary text-on-secondary",
};

export function Badge({
  className,
  tone = "neutral",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        tones[tone],
        className
      )}
      {...props}
    />
  );
}

export function LiveBadge({ className }: { className?: string }) {
  return (
    <Badge tone="live" className={cn("uppercase", className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse-live" />
      Live
    </Badge>
  );
}
