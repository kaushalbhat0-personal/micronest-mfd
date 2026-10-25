export interface GuardMatch {
  id: string;
  label: string;
}

const PATTERNS: Array<{ id: string; label: string; pattern: RegExp }> = [
  {
    id: "guaranteed-returns",
    label: "“guaranteed returns” type wording",
    pattern: /guarantee\w*\s+returns?/i,
  },
  {
    id: "assured-returns",
    label: "“assured returns” type wording",
    pattern: /assur\w*\s+returns?/i,
  },
  { id: "risk-free", label: "“risk-free” type wording", pattern: /risk[\s-]*free/i },
  {
    id: "double-money",
    label: "“double money” type promise",
    pattern: /double\s+(your\s+)?(money|amount|investment|returns?|wealth)/i,
  },
  {
    id: "guaranteed-profit",
    label: "“guaranteed profit” type wording",
    pattern: /guarantee\w*\s+profit/i,
  },
  { id: "assured-profit", label: "“assured profit” type wording", pattern: /assur\w*\s+profit/i },
  { id: "fixed-returns", label: "“fixed returns” type wording", pattern: /fixed\s+returns?/i },
  { id: "hundred-percent-safe", label: "“100% safe” type wording", pattern: /100\s*%\s*safe/i },
  {
    id: "certain-profit",
    label: "certainty of profit/returns",
    pattern: /certain\s+(returns?|profit)/i,
  },
];

/**
 * Scans a final message for obviously inappropriate promise-type wording.
 * This is a lightweight guardrail only — it does NOT certify SEBI/AMFI compliance.
 * Patterns are intentionally narrow: when in doubt we leave wording alone and
 * let the MFD judge, rather than blocking legitimate messages.
 */
export function scanMessage(text: string): GuardMatch[] {
  const hits: GuardMatch[] = [];
  for (const p of PATTERNS) {
    if (p.pattern.test(text)) {
      hits.push({ id: p.id, label: p.label });
    }
  }
  return hits;
}

export function hasGuardIssue(text: string): boolean {
  return scanMessage(text).length > 0;
}
