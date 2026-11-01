import Link from "next/link";

/**
 * Product wordmark (MFD-76 Phase A). The global identity is "MicroNest"
 * alone — a generic user must never encounter MFD in the primary
 * brand/navigation identity. The optional `badge` keeps MFD visible only
 * where it is legitimately useful (an MFD vertical surface explicitly
 * opting in), never by default.
 */
export function BrandMark({ href, badge }: { href: string; badge?: string }) {
  return (
    <Link
      href={href}
      data-testid="brand-mark"
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
    >
      <span className="text-[17px] font-bold tracking-tight text-stone-900">MicroNest</span>
      {badge ? (
        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-emerald-900 uppercase ring-1 ring-emerald-900/20 ring-inset">
          {badge}
        </span>
      ) : null}
    </Link>
  );
}
