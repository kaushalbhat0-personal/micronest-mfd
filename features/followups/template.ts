/**
 * The application-owned CSV contract. The template file, the validator,
 * and the UI example all reference these constants — never hardcode
 * header names anywhere else.
 */
export const TEMPLATE_HEADERS = [
  "Client Name",
  "Mobile",
  "Next Follow-up",
  "Reason",
  "Note",
] as const;

export type TemplateHeader = (typeof TEMPLATE_HEADERS)[number];

export const REQUIRED_HEADERS: TemplateHeader[] = ["Client Name", "Next Follow-up"];

export const TEMPLATE_FILENAME = "followup-template.csv";

/** Example rows shown in the UI as documentation only — never shipped in the CSV. */
export const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ["Rajesh Patil", "9876543210", "25/10/2026", "SIP", "Mandate pending"],
  ["Amit Shah", "", "26/10/2026", "KYC", "Call after 11am"],
];
