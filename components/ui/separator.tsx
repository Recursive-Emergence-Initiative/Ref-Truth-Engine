import * as React from "react";
import { cn } from "@/lib/utils";

type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  orientation?: "horizontal" | "vertical";
};

export function Separator({ className, orientation = "horizontal", ...props }: SeparatorProps) {
  const baseClasses =
    orientation === "vertical"
      ? "h-full w-px bg-slate-200"
      : "h-px w-full bg-slate-200";
  return <div className={cn(baseClasses, className)} role="separator" {...props} />;
}
