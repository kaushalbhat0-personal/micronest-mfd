export interface ParsedCsv {
  /** Header fields of the first non-blank record. Empty when the file has no content. */
  header: string[];
  /** Non-blank data records with their 1-based file line numbers. */
  rows: Array<{ line: number; fields: string[] }>;
  /** 1-based file lines rejected for unbalanced quotes. */
  malformed: number[];
  blankCount: number;
}

/** Delimiters the parser can detect, in tie-break priority (comma wins). */
const CANDIDATE_DELIMITERS = [",", ";", "\t"] as const;

/** Counts unquoted occurrences of a delimiter in one line. */
function countUnquoted(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === delimiter) count += 1;
  }
  return count;
}

/**
 * Detects the field delimiter from the header line (the first non-blank
 * line). Column names never contain stray delimiters, so the header is the
 * most reliable signal. Comma wins all ties so ordinary comma CSV never
 * regresses. Falls back to comma when nothing is found (single-column or
 * empty input).
 */
export function detectCsvDelimiter(text: string): string {
  const withoutBom = text.replace(/^\uFEFF/, "");
  const lines = withoutBom.split(/\r\n|\r|\n/);
  const headerLine = lines.find((line) => line.trim().length > 0);
  if (!headerLine) return ",";
  let best = ",";
  let bestScore = 0;
  for (const delimiter of CANDIDATE_DELIMITERS) {
    const score = countUnquoted(headerLine, delimiter);
    if (score > bestScore) {
      bestScore = score;
      best = delimiter;
    }
  }
  return bestScore > 0 ? best : ",";
}

/**
 * Minimal RFC-4180-style parser: commas (or a detected semicolon/tab),
 * quoted fields, escaped quotes (""), CRLF/LF, BOM. Multiline quoted fields
 * are NOT supported — a line with an odd number of quotes is reported as
 * malformed. Notes are single-line by contract, so this keeps the parser
 * honest and small.
 */
export function parseCsv(text: string): ParsedCsv {
  const delimiter = detectCsvDelimiter(text);
  const withoutBom = text.replace(/^\uFEFF/, "");
  const lines = withoutBom.split(/\r\n|\r|\n/);
  // A trailing newline terminates the last line; it is not a blank row.
  if (lines.length > 0 && lines[lines.length - 1].trim().length === 0) {
    lines.pop();
  }
  const rows: Array<{ line: number; fields: string[] }> = [];
  const malformed: number[] = [];
  let blankCount = 0;
  let header: string[] | null = null;

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    if (rawLine.trim().length === 0) {
      // Blank lines before the header are structural; only data-area
      // blanks count as skipped rows.
      if (header !== null) blankCount += 1;
      return;
    }
    const parsed = parseLine(rawLine, delimiter);
    if (parsed === null) {
      malformed.push(lineNumber);
      return;
    }
    if (header === null) {
      header = parsed;
    } else {
      rows.push({ line: lineNumber, fields: parsed });
    }
  });

  return { header: header ?? [], rows, malformed, blankCount };
}

/** Returns null when quotes are unbalanced. */
function parseLine(line: string, delimiter: string): string[] | null {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        current += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === delimiter) {
      fields.push(current);
      current = "";
      i += 1;
    } else {
      current += ch;
      i += 1;
    }
  }

  if (inQuotes) return null;
  fields.push(current);
  return fields;
}

/** Case-insensitive, trimmed, BOM-safe header comparison for owned CSV contracts. */
export function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase();
}
