import * as React from "react";
import { cn } from "@/lib/utils";

type SwitchProps = {
  checked?: boolean;
  onCheckedChange?: (value: boolean) => void;
  className?: string;
};

export function Switch({ checked = false, onCheckedChange, className }: SwitchProps) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden
        className={cn(
          "relative inline-flex h-5 w-10 items-center rounded-full border border-slate-300 bg-slate-200 transition-colors",
          checked && "bg-slate-900"
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 translate-x-1 rounded-full bg-white transition-transform",
            checked && "translate-x-5"
          )}
        />
      </span>
    </label>
  );
}
