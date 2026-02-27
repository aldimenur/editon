import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/shared/lib/cn";

type ProgressProps = {
  value?: number;
  indeterminate?: boolean;
  className?: string;
};

export function Progress({
  value,
  indeterminate = false,
  className,
}: ProgressProps) {
  const safeValue = Math.max(0, Math.min(100, value ?? 0));

  return (
    <ProgressPrimitive.Root
      className={cn("progress-root", className)}
      value={indeterminate ? undefined : safeValue}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "progress-indicator",
          indeterminate && "is-indeterminate",
        )}
        style={
          indeterminate
            ? undefined
            : { transform: `translateX(-${100 - safeValue}%)` }
        }
      />
    </ProgressPrimitive.Root>
  );
}
