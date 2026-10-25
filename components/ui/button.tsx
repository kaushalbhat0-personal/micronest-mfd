import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  primary: "bg-emerald-900 text-white hover:bg-emerald-800 focus-visible:ring-emerald-900",
  secondary:
    "bg-white text-stone-900 border border-stone-300 hover:bg-stone-100 focus-visible:ring-stone-500",
  ghost: "bg-transparent text-emerald-900 hover:bg-emerald-50 focus-visible:ring-emerald-900",
};

export function buttonClasses(variant: Variant = "primary", className?: string): string {
  return cn(
    "inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-sm font-medium",
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    className,
  );
}

export function Button({ variant = "primary", className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...rest} />;
}
