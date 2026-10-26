import * as React from "react";
import { cn } from "@/lib/utils";

export type CardPadding = "default" | "compact";

export function cardClasses(padding: CardPadding = "default", className?: string): string {
  return cn(
    "rounded-xl border border-stone-200 bg-white shadow-sm",
    padding === "compact" ? "p-4" : "p-5",
    className,
  );
}

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding;
}

export function Card({ padding = "default", className, ...rest }: CardProps) {
  return <div className={cardClasses(padding, className)} {...rest} />;
}
