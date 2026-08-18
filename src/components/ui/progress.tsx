import { cn } from "@/lib/utils/cn";

export function Progress({
  value,
  className,
  barClassName,
}: {
  value: number; // 0-100
  className?: string;
  barClassName?: string;
}) {
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-surface-container-high", className)}
    >
      <div
        className={cn("h-full rounded-full bg-primary transition-all duration-500", barClassName)}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
