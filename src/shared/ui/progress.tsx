import * as ProgressPrimitive from "@radix-ui/react-progress";

import { cn } from "@/shared/lib/cn";

type ProgressProps = {
  value: number;
  className?: string;
};

export function Progress({ value, className }: ProgressProps) {
  return (
    <ProgressPrimitive.Root
      className={cn("progress-root", className)}
      value={value}
    >
      <ProgressPrimitive.Indicator
        className="progress-indicator"
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}
