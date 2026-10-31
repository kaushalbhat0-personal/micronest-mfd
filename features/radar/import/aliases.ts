import { RADAR_HEADERS, type RadarHeader } from "@/features/radar/template";

/**
 * Deterministic alias map (RCCF-MFD-44). Normalized header text
 * (lowercase, trimmed, single-spaced) → canonical field. No fuzzy
 * matching: anything unlisted stays unmapped for manual mapping.
 */
const ALIASES: Record<string, RadarHeader> = {
  // Client name
  name: "Client Name",
  "client name": "Client Name",
  client: "Client Name",
  "investor name": "Client Name",
  "customer name": "Client Name",
  // Mobile
  mobile: "Mobile",
  "mobile number": "Mobile",
  "mobile no": "Mobile",
  phone: "Mobile",
  "phone number": "Mobile",
  contact: "Mobile",
  "contact number": "Mobile",
  // Investment type
  "investment type": "Investment Type",
  investment: "Investment Type",
  type: "Investment Type",
  // Amount buckets (relationship context — never portfolio value or returns)
  sip: "SIP Amount",
  "sip amount": "SIP Amount",
  "monthly sip": "SIP Amount",
  "monthly sip amount": "SIP Amount",
  lumpsum: "Lumpsum Amount",
  "lumpsum amount": "Lumpsum Amount",
  "lump sum": "Lumpsum Amount",
  "lump sum amount": "Lumpsum Amount",
  // Legacy single Amount column from older templates/files
  amount: "Amount",
  "investment amount": "Amount",
  investmentamount: "Amount",
  "amount invested": "Amount",
  // Last invested
  "last invested": "Last Invested",
  "last investment": "Last Invested",
  "last investment date": "Last Invested",
  "investment date": "Last Invested",
  // Last contacted
  "last contacted": "Last Contacted",
  "last contact": "Last Contacted",
  "last contacted date": "Last Contacted",
  "contact date": "Last Contacted",
  // New client
  "new client": "New Client",
  new: "New Client",
  "is new": "New Client",
  "new investor": "New Client",
  // Note
  note: "Note",
  notes: "Note",
  remark: "Note",
  remarks: "Note",
  comment: "Note",
  comments: "Note",
};

/** Normalizes a raw header cell for alias lookup. */
export function normalizeAliasKey(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Auto-maps source headers to canonical fields. First source column wins
 * when two headers resolve to the same field; the loser stays unmapped
 * ("Don't import") so nothing is silently merged.
 */
export function autoMapColumns(header: string[]): Array<RadarHeader | null> {
  const used = new Set<RadarHeader>();
  return header.map((h) => {
    const canonical = ALIASES[normalizeAliasKey(h)] ?? null;
    if (canonical === null || used.has(canonical)) return null;
    used.add(canonical);
    return canonical;
  });
}

export function canonicalHeaders(): RadarHeader[] {
  return [...RADAR_HEADERS];
}
