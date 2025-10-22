import * as React from "react";
import { cn } from "@/lib/utils";

type SliderProps = {
  value: number[];
  onValueChange?: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
};

export function Slider({ value, onValueChange, min = 0, max = 100, step = 1, className }: SliderProps) {
  const current = value?.[0] ?? 0;

  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={current}
      onChange={(event) => onValueChange?.([Number(event.target.value)])}
      className={cn("h-1 w-full cursor-pointer rounded bg-slate-200", className)}
    />
  );
}
