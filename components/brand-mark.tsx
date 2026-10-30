import Link from "next/link";

/**
 * Premium product wordmark (RCCF-MFD-43). "MicroNest" is the memorable
 * primary identity; "MFD" is a small contextual badge — never the
 * "MicroNest · MFD Workspace" page-title lockup.
 */
export function BrandMark({ href }: { href: string }) {
  return (
    <Link
      href={href}
      data-testid="brand-mark"
      className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
    >
      <span className="text-[17px] font-bold tracking-tight text-stone-900">MicroNest</span>
      <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em] text-emerald-900 uppercase ring-1 ring-emerald-900/20 ring-inset">
        MFD
      </span>
    </Link>
  );
}
