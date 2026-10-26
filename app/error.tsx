"use client";

import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Route error fallback: same visual language as the 404 page.
 * `reset` retries rendering the failed segment.
 */
export default function RouteError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-col items-start gap-2">
          <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
            Something went wrong
          </h1>
          <p className="text-sm leading-relaxed text-stone-600">
            We couldn&apos;t load this page. Please try again.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className={cn(buttonClasses("secondary"), "mt-2")}
          >
            Try again
          </button>
        </div>
      </Card>
    </div>
  );
}
