import { Skeleton } from "@/components/ui/skeleton";

/**
 * Instant shell for the admin subtree. The admin layout blocks on the
 * session + membership gate before children stream, so this static
 * skeleton holds the viewport during that gate instead of a blank page.
 * Shapes only — never fake metric data.
 */
export default function AdminLoading() {
  return (
    <div className="flex flex-col gap-5" aria-label="Loading admin">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
