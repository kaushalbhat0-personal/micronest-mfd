import Link from "next/link";
import { cn } from "@/lib/utils";

interface ToolCardProps {
  title: string;
  description: string;
  href?: string;
  cta?: string;
  comingSoon?: boolean;
}

export function ToolCard({ title, description, href, cta, comingSoon }: ToolCardProps) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-stone-900">{title}</h2>
        {comingSoon && (
          <span className="rounded-full bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-500">
            Coming soon
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-stone-600">{description}</p>
      {cta && !comingSoon && (
        <span className="mt-4 inline-flex min-h-[44px] items-center font-medium text-emerald-900">
          {cta} →
        </span>
      )}
    </>
  );

  if (comingSoon || !href) {
    return (
      <div
        aria-disabled="true"
        className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-5 opacity-80"
      >
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={cn(
        "block rounded-xl border border-stone-200 bg-white p-5 shadow-sm",
        "transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900",
      )}
    >
      {body}
    </Link>
  );
}
