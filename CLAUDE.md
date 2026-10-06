# CLAUDE.md — LedgerAlpha for ABB India (GL scrutiny prototype)

> Auto-loaded in every session in this repo. The **source of truth is [`docs/FRD.md`](docs/FRD.md)**.
> If this file and the FRD ever differ, the FRD wins. Flag the discrepancy.

## What this is
A browser-only demo prototype of LedgerAlpha's **balance sheet review / GL scrutiny**, configured for
ABB India (one company, one division, SAP Central Finance line-item structure). It is shown at a 3-hour
online workshop in the week of 12-Oct-2026. ABB's #1 priority is balance sheet review; #2 is account
reconciliation (scope gated by questionnaire answer S2).

## How we work in this repo
- **Increment by increment.** Build only the increment the user asks for (FRD §16). Do not build ahead.
  Each increment ends with: `npm run typecheck`, `npm test`, `npm run build` passing, a browser
  walk-through at 1366 × 768 with no console errors, and one commit naming the increment.
- **The screen registry is the map.** `src/lib/screens.ts` drives routes, sidebar and the build plan.
  When a screen is built: set its `status` to `"built"` and map its path to the page in `src/App.tsx`.
- **Config, not code, for ABB's answers.** Ageing buckets, thresholds, materiality, approval bands,
  period and division live in `src/config/demo.ts`, each marked with its questionnaire ref (TBC A5…).

## Standing rules (every change)
1. **Stack:** React 18 + TypeScript (strict) + Vite + Tailwind + shadcn/ui + React Router 6 + Zustand +
   Recharts + lucide-react; Vitest for tests. No backend, no auth, no network calls for data.
2. **Money:** INR only, company-code currency, signed SAP-style (debit +, credit −). Format with
   `src/lib/format.ts`: `fmtINR` (₹2,40,00,000), `fmtINRCompact` (₹43.5 lakh, ₹1.97 cr), `fmtDrCr`.
   Never K/M/B, never USD, never a currency switcher.
3. **Dates:** `src/lib/dates.ts` — `fmtDate` → `30-Sep-2026`; ABB periods `Q3 CY2026` (calendar-year FY);
   income-tax quarters `FY2026-27 Q2` (Apr–Mar) for TDS / 26AS. Parse ISO dates with `parseIsoDate`.
4. **SAP-native data.** Fields mirror FBL3N / ACDOCA (FRD §6.3); UI labels use SAP terms.
5. **Every record is real.** Every item is evaluated by every applicable rule and opens to a complete
   detail. No hero-only depth, no generated shells (LedgerAlpha's "fidelity cliff").
6. **No toast-only actions.** Every button changes visible state. No hard-coded KPIs — compute from data.
7. **Glass box.** Rule hits are `Deterministic`; recommendations and drafted text are `Judgement`
   (`MethodBadge`). Confidence is always derived from shown factors — never a bare number.
8. **Proposal only.** Never write "autonomous", "auto-posted", "posted to SAP". Outputs are proposals
   ABB's team posts. Write-backs and TDS write-offs always route to the Tax Reviewer.
9. **Honest data.** The data banner always says synthetic vs masked. Real ABB staff names never appear;
   people are fictional. Masked ABB data lives only in `data/private/` (git-ignored), never committed.
10. **Legal references:** do not show Income-tax Act section numbers on screen until the Income-tax Act,
    2025 mapping is verified (FRD §7.3) — show the nature of payment instead.
11. **Visualization-first:** each screen opens on a signal visual, then summaries, then tables as
    drill-down. Status colour only for state (`ok`/`warn`/`danger`/`info`/neutral).

## Harvesting from LedgerAlpha
`/app/app-ledger-alpha` is the source of the design system and components (FRD §12 harvest map).
**Copy, never import across repos, and never modify that repo** (it holds uncommitted in-flight work).
Add a one-line provenance comment to each harvested file. Adapt money: `amountUSD` → `amount`,
`fmtMoney` → `fmtINRCompact`, drop `useCurrencyStore`.

## Layout
`src/pages/` one component per route · `src/components/{ui,vocab,shell}` shared (exec visuals arrive with
their increments) · `src/config/` demo config · `src/types/` domain contract (draft until I1) ·
`src/lib/` stores, formatters, dates, screen registry · `src/engine/` rules + recommender (I2) ·
`src/data/` seed generator (I1) · `docs/FRD.md` requirements.

## Commands
`npm run dev` (port 5180) · `npm run typecheck` · `npm test` · `npm run build`
