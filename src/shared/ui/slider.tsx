import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/shared/lib/cn";

type SliderProps = {
  value: number[];
  min?: number;
  max?: number;
  step?: number;
  onValueChange: (value: number[]) => void;
  className?: string;
};

export function Slider({
  value,
  min = 0,
  max = 100,
  step = 1,
  onValueChange,
  className,
}: SliderProps) {
  return (
    <SliderPrimitive.Root
      className={cn("slider-root", className)}
      value={value}
      min={min}
      max={max}
      step={step}
      onValueChange={onValueChange}
    >
      <SliderPrimitive.Track className="slider-track">
        <SliderPrimitive.Range className="slider-range" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="slider-thumb" aria-label="Value" />
    </SliderPrimitive.Root>
  );
}
