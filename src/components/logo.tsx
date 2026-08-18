import { cn } from "@/lib/utils/cn";

export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-xl font-extrabold tracking-tight text-primary",
        className
      )}
    >
      Digital<span className="text-on-surface"> Jury</span>
    </span>
  );
}
