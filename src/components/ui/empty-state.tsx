import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low/50 px-6 py-12 text-center",
        className
      )}
    >
      {icon && <div className="text-3xl">{icon}</div>}
      <p className="font-display text-base font-semibold text-on-surface">
        {title}
      </p>
      {description && (
        <p className="max-w-sm text-sm text-on-surface-variant">{description}</p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
