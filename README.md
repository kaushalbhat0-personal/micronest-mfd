# MicroNest — MFD Microtools

Small operational microtools for Mutual Fund Distributors. Each tool does one job,
opens fast on a phone, and works **alongside** the distributor's existing financial
software. Nothing here replaces the system of record.

Live tool: **Message Studio** (`/tools/message-studio`) — deterministic
WhatsApp/email message templates with wording guardrails. No login, no database.

## Run locally

```bash
npm install
npm run dev      # http://localhost:3000
```

## Commands

| Command             | Purpose                                                  |
| ------------------- | -------------------------------------------------------- |
| `npm run dev`       | Local dev server                                         |
| `npm run typecheck` | `tsc --noEmit`                                           |
| `npm run lint`      | ESLint                                                   |
| `npm run test`      | Vitest unit tests                                        |
| `npm run e2e`       | Playwright (smoke + axe accessibility, mobile + desktop) |
| `npm run build`     | Production build (must pass before commit)               |
| `npm run format`    | Prettier write                                           |

Phase-01 needs **no environment variables** and no paid services.

## Folder structure

```text
app/                          # Routes only (thin pages + metadata)
  page.tsx                    # Tool grid (1 active + coming-soon cards)
  tools/message-studio/       # Route wrapper, imports the feature
features/message-studio/      # Feature module: EVERYTHING the tool owns
  templates.ts                # Template registry (the only place purposes live)
  validation.ts               # Required-field validation (reads the registry)
  sensitive.ts                # PAN/Aadhaar/OTP detection (warn-only, never stored)
  compliance.ts               # Promise-wording guardrail (warn-only, not certification)
  prefs.ts                    # Browser-local UI prefs (never client data)
  components/                 # Feature UI (form, preview, purpose fields)
components/ui/                # Shared primitives: Button, Card, Field/inputs, Alert
lib/                          # Genuinely shared code only: utils (cn), whatsapp (wa.me)
tests/unit/                   # Unit tests mirroring features/* + lib/*
e2e/                          # Playwright smoke + accessibility specs
```

**Scalability rule (project law):** new microtools are independent feature modules
under `features/<tool>/`. Shared code is allowed only for genuinely shared concerns
(`lib/`, `components/ui/`). A shared abstraction must have a clear owner, a clear
API, and no knowledge of any tool's business rules. No repositories, services,
dependency injection, or global stores until a concrete need exists.

## Where things live (Day-1 answers)

| Question                              | Answer                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------- |
| Add/change a message purpose?         | `features/message-studio/templates.ts` → add one `TEMPLATES` entry         |
| Change validation rule?               | `features/message-studio/validation.ts` (`validateField`)                  |
| Change sensitive-data screening?      | `features/message-studio/sensitive.ts`                                     |
| Change guardrail wording list?        | `features/message-studio/compliance.ts`                                    |
| Change WhatsApp link format?          | `lib/whatsapp.ts`                                                          |
| Change button/input/card/alert style? | `components/ui/*`                                                          |
| Change page background?               | `:root --app-bg` in `app/globals.css` (+ `.bg-app`)                        |
| Add a new microtool?                  | New route `app/tools/<tool>/page.tsx` + new `features/<tool>/` (see below) |

## Adding a message template (5th purpose)

1. Add one entry to `TEMPLATES` in `features/message-studio/templates.ts`
   (id, label, description, `requiredFields`, `build` function).
2. Add the id to `TEMPLATE_ORDER`.
3. Add one branch in `PurposeFields` (`components/purpose-fields.tsx`).
4. Add tests in `tests/unit/message-templates.test.ts`.
5. No validation changes needed — `validateMessageInput` reads `requiredFields`.

No switch statements to update, no registries to wire.

## Adding a new microtool (e.g. follow-ups)

1. Create `app/tools/<tool>/page.tsx` (metadata + feature import, nothing else).
2. Create `features/<tool>/` with its own domain files + `components/`.
3. Import from `@/components/ui/*` and `@/lib/*` only — never from another feature.
4. Add a `ToolCard` on `/` and an e2e smoke spec.
5. If (and only if) it needs auth/database, introduce Supabase scoped to that
   feature — Message Studio stays dependency-free.

## Design-system rules

- Palette is constrained: `stone` (surfaces/text), `emerald-900/800/50` (single
  brand accent), `red-*` (errors), `amber-*` (warnings). No new colors without a
  product reason.
- Page background token: `--app-bg` / `.bg-app` — change once, everywhere.
- Spacing/radius: `rounded-lg`, `gap-2/3/4/5`, `p-3/4/5` — the existing scale.
- Interactive elements: `min-h-[44px]`, visible focus ring, `role="alert"` +
  `aria-live` for feedback. Axe gate: **0 serious/critical violations**.
- Future primitives (table, dialog, toast, badge, empty state): build
  feature-local first; promote to `components/ui/` only on second use.

## Security / privacy rules (non-negotiable)

- Never collect or store PAN, Aadhaar, bank, OTP, password, folio, or credentials.
- Message Studio persists 5 UI prefs in localStorage — no client names, phones,
  or message text. Keep it that way.
- No `dangerouslySetInnerHTML`. No logging of message contents or phone numbers.
- Guardrails are basic wording warnings. Never label anything "SEBI/AMFI compliant"
  without professional verification.

## What NOT to build

No order placement, portfolio/NAV/holdings, fund recommendations, risk profiling,
KYC execution, document vaults, accounting, bulk messaging APIs, AI generation,
admin dashboards, or notification infrastructure. If a request touches these,
redirect to the existing financial software.
