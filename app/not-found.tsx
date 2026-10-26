import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * 404: warm beige background comes from the root layout; this page stays
 * typographic — no illustrations, same Card + button primitives.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-col items-start gap-2">
          <p className="eyebrow">404</p>
          <h1 className="text-xl font-semibold tracking-tight text-stone-900 sm:text-2xl">
            Page not found
          </h1>
          <p className="text-sm leading-relaxed text-stone-600">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <Link href="/workspace/today" className={cn(buttonClasses("primary"), "mt-2")}>
            Go to workspace
          </Link>
        </div>
      </Card>
    </div>
  );
}
