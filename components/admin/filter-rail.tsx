import Link from "next/link";
import { cn } from "@/lib/utils";

export interface RailOption {
  value: string;
  label: string;
  href: string;
  selected: boolean;
}

interface FilterRailProps {
  label: string;
  options: RailOption[];
}

/**
 * Horizontal filter rail for admin lists. Reuses the workspace chip visual
 * language on links (URL state keeps refresh/back/forward/share working
 * without client JavaScript). The `Chip` button primitive cannot carry a
 * link, so this mirrors its classes on `<Link>` with `aria-current`
 * instead of `aria-pressed`. Scrolls horizontally on mobile, wraps on sm+.
 */
export function FilterRail({ label, options }: FilterRailProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{label}</p>
      <div
        role="group"
        aria-label={label}
        className="scroll-x -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {options.map((option) =>
          option.selected ? (
            <span
              key={option.value}
              aria-current="true"
              className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-emerald-900 bg-emerald-900 px-4 text-sm font-medium text-white"
            >
              {option.label}
            </span>
          ) : (
            <Link
              key={option.value}
              href={option.href}
              className={cn(
                "inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm font-medium",
                "border-stone-300 bg-white text-stone-700 hover:bg-stone-50 active:bg-stone-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900 focus-visible:ring-offset-1",
              )}
            >
              {option.label}
            </Link>
          ),
        )}
      </div>
    </div>
  );
}
