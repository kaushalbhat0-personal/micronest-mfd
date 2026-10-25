"use client";

import { Button, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buildCallUrl, buildWhatsAppUrl } from "@/lib/whatsapp";
import { reasonsFor } from "../signals";
import { radarWhatsAppText } from "../view";
import type { ClientRecord } from "../types";

interface RadarClientCardProps {
  record: ClientRecord;
  todayYMD: string;
  onMessage: (record: ClientRecord) => void;
  onContacted: (id: string) => void;
}

/** One client: who, why they matter, and the tap-to-reach actions. */
export function RadarClientCard({
  record,
  todayYMD,
  onMessage,
  onContacted,
}: RadarClientCardProps) {
  const reasons = reasonsFor(record, record.signals, todayYMD);
  const callUrl = buildCallUrl(record.phone);
  const waUrl = record.phoneValid
    ? buildWhatsAppUrl(radarWhatsAppText(record.name), record.phone)
    : null;

  return (
    <article
      aria-label={`Client ${record.name}`}
      className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-stone-900">{record.name}</h3>
        <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-900">
          {record.investmentType}
        </span>
      </div>

      {reasons.length > 0 && (
        <ul aria-label="Why contact" className="mt-2 space-y-1">
          {reasons.map((reason) => (
            <li key={reason} className="flex items-start gap-2 text-sm text-stone-700">
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-700"
              />
              {reason}
            </li>
          ))}
        </ul>
      )}

      {record.note.length > 0 && <p className="mt-2 text-xs text-stone-500">{record.note}</p>}

      {!callUrl && (
        <p className="mt-2 text-xs text-stone-500">
          {record.phone
            ? "Phone number needs checking — Call and WhatsApp unavailable."
            : "Phone unavailable — Message still available."}
        </p>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        {callUrl ? (
          <a href={callUrl} className={cn(buttonClasses("primary"))}>
            Call
          </a>
        ) : null}
        {waUrl ? (
          <a
            href={waUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonClasses(callUrl ? "secondary" : "primary"))}
          >
            WhatsApp
          </a>
        ) : null}
        <Button variant="secondary" onClick={() => onMessage(record)}>
          Message
        </Button>
        <Button variant="secondary" onClick={() => onContacted(record.id)}>
          Mark Contacted
        </Button>
      </div>
    </article>
  );
}
