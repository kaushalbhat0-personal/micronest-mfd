import { cn } from "@/lib/utils";

/**
 * Skeleton blocks (RCCF-MFD-29 Phase A). Static shapes with a soft pulse;
 * reduced-motion CSS in globals kills the pulse, leaving static blocks.
 * Never pair with a spinner — the shape IS the loading state.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("skeleton-pulse block rounded-md bg-stone-200", className)}
    />
  );
}

/** Attention-strip shaped loader: three stat blocks in one row. */
export function AttentionStripSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading today's summary"
      className="grid grid-cols-3 gap-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm"
    >
      {[0, 1, 2].map((i) => (
        <span key={i} className="flex flex-col items-center gap-1.5 py-1">
          <Skeleton className="h-5 w-8" />
          <Skeleton className="h-3 w-14" />
        </span>
      ))}
    </div>
  );
}

/** Priority-card shaped loader: why-line, name, action. */
export function ClientCardSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-2.5 rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <Skeleton className="mt-1 h-12 w-full !rounded-lg" />
    </div>
  );
}

/** Full Today loading shape: greeting + strip + chips + cards. */
export function TodaySkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-56" />
      </div>
      <AttentionStripSkeleton />
      <div className="flex gap-1.5 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-28 shrink-0 !rounded-full" />
        ))}
      </div>
      <ClientCardSkeleton />
      <ClientCardSkeleton />
    </div>
  );
}
