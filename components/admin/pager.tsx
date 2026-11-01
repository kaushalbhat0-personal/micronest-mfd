import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PagerProps {
  page: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
  label: string;
}

/**
 * Minimal server-side pager for admin lists. Links preserve the current
 * filter state via caller-built hrefs; a null href renders an inert,
 * disabled-look span so layout never shifts. No page-number framework —
 * Prev/Next plus "Page X of Y" is all an operator console needs.
 */
export function Pager({ page, totalPages, prevHref, nextHref, label }: PagerProps) {
  return (
    <nav aria-label={label} className="flex items-center justify-between gap-3">
      {prevHref ? (
        <Link href={prevHref} className={cn(buttonClasses("secondary"), "shrink-0")}>
          ← Prev
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={cn(buttonClasses("secondary"), "shrink-0 opacity-50")}
        >
          ← Prev
        </span>
      )}
      <p aria-live="polite" className="tnum min-w-0 flex-1 text-center text-sm text-stone-600">
        Page {page} of {totalPages}
      </p>
      {nextHref ? (
        <Link href={nextHref} className={cn(buttonClasses("secondary"), "shrink-0")}>
          Next →
        </Link>
      ) : (
        <span
          aria-disabled="true"
          className={cn(buttonClasses("secondary"), "shrink-0 opacity-50")}
        >
          Next →
        </span>
      )}
    </nav>
  );
}
