import * as SeparatorPrimitive from "@radix-ui/react-separator";

import { cn } from "@/shared/lib/cn";

type SeparatorProps = {
  className?: string;
};

export function Separator({ className }: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      decorative
      orientation="horizontal"
      className={cn("ui-separator", className)}
    />
  );
}
