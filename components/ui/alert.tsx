import * as React from "react";
import { cn } from "@/lib/utils";

type AlertVariant = "error" | "warning";

const VARIANTS: Record<AlertVariant, string> = {
  error: "border-red-300 bg-red-50 text-red-900",
  warning: "border-amber-500 bg-amber-50 text-amber-900",
};

interface AlertProps {
  variant: AlertVariant;
  title: string;
  children?: React.ReactNode;
}

/** Shared alert block. Always uses role="alert" so it is announced. */
export function Alert({ variant, title, children }: AlertProps) {
  return (
    <div role="alert" className={cn("rounded-lg border p-3 text-sm", VARIANTS[variant])}>
      <p className="font-semibold">{title}</p>
      {children}
    </div>
  );
}
