import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEMPLATE_EXAMPLE_ROWS } from "../template";

/** First-run explainer: download, 4 steps, format notes, and a visual example. */
export function TemplateDownload() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <a
          href="/followup-template.csv"
          download="followup-template.csv"
          className={cn(buttonClasses("primary"), "sm:flex-1")}
        >
          Download Follow-up Template
        </a>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-stone-600">
        <li>Download the template.</li>
        <li>Add your clients and follow-up dates.</li>
        <li>Save as CSV.</li>
        <li>Upload it here.</li>
      </ol>

      <div className="flex flex-col gap-1 text-xs text-stone-500">
        <p>Date format: DD/MM/YYYY (e.g. 25/10/2026).</p>
        <p>Maximum 500 clients per file. Nothing leaves your device.</p>
        <p>Example reasons: SIP · KYC · Review · Document · Mandate · Call back.</p>
      </div>

      <div
        role="region"
        aria-label="Example CSV rows"
        tabIndex={0}
        className="overflow-x-auto rounded-lg border border-stone-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-900"
      >
        <table className="w-full min-w-[520px] border-collapse text-left text-xs">
          <caption className="bg-stone-50 px-3 py-2 text-left font-medium text-stone-700">
            Example — how a filled row looks (do not upload this; use your own data)
          </caption>
          <thead>
            <tr className="border-t border-stone-200 bg-white">
              {["Client Name", "Mobile", "Next Follow-up", "Reason", "Note"].map((h) => (
                <th key={h} scope="col" className="px-3 py-2 font-semibold text-stone-800">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white">
            {TEMPLATE_EXAMPLE_ROWS.map((row, i) => (
              <tr key={i} className="border-t border-stone-100">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 text-stone-600">
                    {cell === "" ? <span className="text-stone-400">—</span> : cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stone-500">
        Already have last week&apos;s file? Update the dates and upload it again —{" "}
        <Link href="#upload" className="font-medium text-emerald-900 hover:underline">
          skip to upload
        </Link>
        .
      </p>
    </div>
  );
}
