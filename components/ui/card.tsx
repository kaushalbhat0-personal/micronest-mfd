import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-stone-200 bg-white p-5 shadow-sm", className)}
      {...rest}
    />
  );
}
