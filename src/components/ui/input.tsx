import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface",
      "placeholder:text-on-surface-variant/60",
      "focus:border-primary focus:bg-surface-container-lowest focus:outline-2 focus:outline-primary/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 py-2.5 text-sm text-on-surface",
      "placeholder:text-on-surface-variant/60",
      "focus:border-primary focus:bg-surface-container-lowest focus:outline-2 focus:outline-primary/40",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({
  className,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "mb-1.5 block text-sm font-medium text-on-surface",
        className
      )}
      {...props}
    />
  );
}

export const Select = forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-11 w-full rounded-lg border border-outline-variant bg-surface-container-low px-3 text-sm text-on-surface",
      "focus:border-primary focus:outline-2 focus:outline-primary/40",
      className
    )}
    {...props}
  />
));
Select.displayName = "Select";
