# CLAUDE.md — LedgerAlpha (agentic record-to-report platform, India localisation)

> Auto-loaded in every session in this repo. The **source of truth is [`docs/FRD.md`](docs/FRD.md)**.
> If this file and the FRD ever differ, the FRD wins — flag the discrepancy.

## What this is
LedgerAlpha is a product: one platform above the ERP for the whole record-to-report cycle — close,
reconcile & review, treasury, tax, reporting, audit & controls — on one shared data foundation, with
agents that propose and people who decide. This prototype runs in the browser on a configured demo
workspace (currently set up for an ABB India workshop, week of 12-Oct-2026).

## Product rules (non-negotiable)
1. **Product-first.** No customer-specific modules, sections, labels or copy anywhere in `src/` outside
   `src/config/tenant.ts` and the demo dataset. Customers are configuration and data, never code.
2. **Production page pattern.** Page header = breadcrumbs (detail pages) + title + status badge + actions.
   **No description or narrative text under a title, no explanatory paragraphs on pages.** Help goes in
   tooltips. `PageHeader` has no description prop — do not add one.
3. **Page anatomy:** KPI row → lead visual → supporting panel → detail table as drill-down. Never a table
   as the landing view. Status colour only for state; chips always carry text.
4. **One ledger, many lenses.** Every module reads the same data; a document resolves identically
   everywhere and links across modules (FRD §6 cohesion map). Never create per-module copies of data.
5. **Every number computed, every row real, every action changes state.** No hard-coded KPIs, no
   generated shells behind a few "hero" records, no toast as the only outcome.
6. **Agents propose, people decide.** Approvals follow the shared workflow (FRD §4.4); self-approval is
   blocked. Never write "autonomous", "auto-posted" or "posted to SAP" — journals are proposals.
7. **Glass box.** Rule results are `Deterministic`, recommendations and drafts are `Judgement`
   (`MethodBadge`); confidence always shows its derivation.
8. **Unbuilt modules are disabled in the workspace config**, not shown as placeholders, in the demo.

## Localisation and configuration
- Country behaviour lives in `src/config/localisation.ts` (India pack: INR, en-IN grouping, GST/TDS
  labels, Schedule III, statutory ageing bands, Apr–Mar tax year).
- Workspace lives in `src/config/tenant.ts` (entities, business units, fiscal calendar, period, data mode,
  enabled modules). Policies in `src/config/policies.ts`. Roles in `src/config/roles.ts`.
- Money: `src/lib/format.ts` — `fmtINR` (₹2,40,00,000), `fmtINRCompact` (₹43.5 lakh, ₹1.97 cr),
  `fmtDrCr`. Never K/M/B, never a currency switcher.
- Dates: `src/lib/dates.ts` — `fmtDate` → `30-Sep-2026`; `fiscalQuarterLabel` for the workspace calendar
  ("Q3 CY2026") and for the statutory tax year ("Q2 FY2026-27"). Parse ISO dates with `parseIsoDate`.
- Legal references: no Income-tax Act section numbers on screen until the Income-tax Act, 2025 mapping is
  verified (FRD §7.4) — show the nature of payment.
- Real people never appear in data; masked customer data lives only in `data/private/` (git-ignored).

## How we work
- **One increment per prompt** (FRD §13). Do not build ahead. Each increment ends with
  `npm run typecheck`, `npm test`, `npm run build`, a walk-through at 1366 × 768 with no console errors,
  and one commit naming the increment.
- **The module registry is the map:** `src/lib/modules.ts` drives routes and the sidebar. When a module is
  built, map its path to the page in `src/App.tsx` (`BUILT`).

## Harvesting
Design system and components come from LedgerAlpha (`/app/app-ledger-alpha`); matching-engine ideas may
come from Recon-Alpha (`/app/app-recon-alpha`). **Copy, never import across repos, never modify either
repo** (LedgerAlpha holds uncommitted in-flight work). Add a one-line provenance comment per harvested
file. Money: `amountUSD` → `amount`, `fmtMoney` → `fmtINRCompact`, drop `useCurrencyStore`.

## Layout
`src/pages/` one component per route · `src/components/{ui,vocab,shell}` shared (more arrive with
modules) · `src/config/` tenant, localisation, policies, roles · `src/types/` data contract ·
`src/lib/` stores, formatters, dates, module registry · `src/engine/` rules, matchers, recommenders (I2+) ·
`src/data/` seeded world generator (I1) · `docs/FRD.md`.

## Commands
`npm run dev` (port 5180) · `npm run typecheck` · `npm test` · `npm run build`
