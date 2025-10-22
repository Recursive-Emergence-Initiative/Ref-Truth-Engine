import * as React from "react";
import { cn } from "@/lib/utils";

type CardProps = React.HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
  return <div className={cn("rounded-lg border bg-white text-slate-900", className)} {...props} />;
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn("border-b px-4 py-3", className)} {...props} />;
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn("px-4 py-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-lg font-semibold", className)} {...props} />;
}
