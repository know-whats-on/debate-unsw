"use client";

import { cn } from "@/lib/utils/cn";

export function Tabs<T extends string>({
  value,
  onValueChange,
  tabs,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  tabs: { value: T; label: string }[];
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-lg bg-surface-container p-1",
        className
      )}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          type="button"
          aria-selected={value === tab.value}
          onClick={() => onValueChange(tab.value)}
          className={cn(
            "h-9 rounded-md px-4 text-sm font-medium transition-colors",
            value === tab.value
              ? "bg-primary text-on-primary shadow-raised"
              : "text-on-surface-variant hover:text-on-surface"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
