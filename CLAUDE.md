# CLAUDE.md - LedgerAlpha (agentic record-to-report platform, India localisation)

> Auto-loaded in every session in this repo. The **source of truth is [`docs/FRD.md`](docs/FRD.md)**.
> If this file and the FRD ever differ, the FRD wins - flag the discrepancy.

## What this is
LedgerAlpha is a product: one platform above the ERP for the whole record-to-report cycle - close,
reconcile & review, treasury, tax, reporting, audit & controls - on one shared data foundation, with
agents that propose and people who decide. This prototype runs in the browser on a configured demo
workspace (currently set up for an ABB India workshop, week of 12-Oct-2026).

## Product rules (non-negotiable)
1. **Product-first.** No customer-specific modules, sections, labels or copy anywhere in `src/` outside
   `src/config/tenant.ts` and the demo dataset. Customers are configuration and data, never code.
2. **Production page pattern.** Page header = breadcrumbs (detail pages) + title + status badge + actions.
   **No description or narrative text under a title, no explanatory paragraphs on pages.** Help goes in
   tooltips. `PageHeader` has no description prop - do not add one.
3. **Page anatomy:** KPI row → lead visual → supporting panel → detail table as drill-down. Never a table
   as the landing view. Status colour only for state; chips always carry text.
4. **One ledger, many lenses.** Every module reads the same data; a document resolves identically
   everywhere and links across modules (FRD §6 cohesion map). Never create per-module copies of data.
5. **Every number computed, every row real, every action changes state.** No hard-coded KPIs, no
   generated shells behind a few "hero" records, no toast as the only outcome.
6. **Agents propose, people decide.** Approvals follow the shared workflow (FRD §4.4); self-approval is
   blocked. Never write "autonomous", "auto-posted" or "posted to SAP" - journals are proposals.
7. **Glass box.** Rule results are `Deterministic`, recommendations and drafts are `Judgement`
   (`MethodBadge`); confidence always shows its derivation.
8. **Unbuilt modules are disabled in the workspace config**, not shown as placeholders, in the demo.
9. **No em dashes** (the long dash) anywhere: UI copy, data, docs, code comments, commit messages. Use a
   colon, comma, full stop or " - ". Truncated text must show in full on hover (`TruncationTooltip` is
   global; use `truncate`, do not hand-roll titles).

## Localisation and configuration
- Country behaviour lives in `src/config/localisation.ts` (India pack: INR, en-IN grouping, GST/TDS
  labels, Schedule III, statutory ageing bands, Apr–Mar tax year).
- Workspace lives in `src/config/tenant.ts` (entities, business units, fiscal calendar, period, data mode,
  enabled modules). Policies in `src/config/policies.ts`. Roles in `src/config/roles.ts`.
- Money: `src/lib/format.ts` - `fmtINR` (₹2,40,00,000), `fmtINRCompact` (₹43.5 lakh, ₹1.97 cr),
  `fmtDrCr`. Never K/M/B, never a currency switcher.
- Dates: `src/lib/dates.ts` - `fmtDate` → `30-Sep-2026`; `fiscalQuarterLabel` for the workspace calendar
  ("Q3 CY2026") and for the statutory tax year ("Q2 FY2026-27"). Parse ISO dates with `parseIsoDate`.
- Legal references: no Income-tax Act section numbers on screen until the Income-tax Act, 2025 mapping is
  verified (FRD §7.4) - show the nature of payment.
- Real people never appear in data; masked customer data lives only in `data/private/` (git-ignored).

## How we work
- **One increment per prompt** (FRD §13). Do not build ahead. Each increment ends with
  `npm run typecheck`, `npm test`, `npm run build`, a walk-through at 1366 × 768 with no console errors,
  and one commit naming the increment.
- **The module registry is the map:** `src/lib/modules.ts` drives routes and the sidebar. When a module is
  built, map its path to the page in `src/App.tsx` (`BUILT`).

## Data foundation (I1)
- Modules read data only through `src/data` (`WORLD`, `BALANCES`, `QUALITY`, `DATASETS`, the `*_BY_ID`
  maps, `openItems`, `balanceAt`). Never construct ledger figures inside a page.
- New data is posted through `LedgerBuilder` (`src/data/generator/builder.ts`) as balanced documents;
  open items are cleared with `builder.clear`. Never push raw lines.
- Workspace-specific inputs live in `src/data/workspace/` (spec, chart of accounts, planted scenarios);
  the generator in `src/data/generator/` stays generic. Scenario IDs never appear in data - use
  `ctx.anchors` for tests.
- `src/data/world.test.ts` must stay green: every load check at zero exceptions, the independent
  closing-balance recomputation equal to the trial balance, and every planted scenario exact.
  Adding data through `ctx.rng` shifts the random stream; that is fine as long as these tests pass, but prefer
  hash-based quantities (see Reporting, I8) when the rest of the world should stay as it is.

## Platform core (I2)
- Rules live in `src/engine/rules/` as a definition (data) plus a deterministic evaluator; register new
  rule sets in `src/engine/run.ts`. Every rule needs a positive and a negative test in
  `src/engine/engine.test.ts`; planted scenarios must keep their expected recommendation.
- Read rule results through `useRuleRun()` / `useRecommendations()` (`src/state/hooks.ts`) - one cached
  evaluation per (period, rule configuration). Never re-run rules inside a component.
- All state changes go through `useWorkflow` actions (`src/state/workflow.ts`): they check `can()`
  (`src/config/roles.ts`), enforce four-eyes and approval bands, and write the activity event. Never mutate
  decisions, follow-ups or sign-offs directly, and never log activity from a page.
- Recommendation confidence is the sum of met factor weights; below 0.60 the action falls back to Follow up.
- Settings → Reset demo restores the seeded workspace state (`src/data/workspace/activity.ts`).

## Balance Sheet Review (I3)
- One review model for the whole app: `ReviewProvider` (AppShell) computes it once from the rule run,
  recommendations, decisions, follow-ups, sign-offs, business-unit scope and period; read it with
  `useReview()` (`src/state/ReviewContext.tsx`). Do not call `useComputeReview` anywhere else, and do not
  rebuild item rows in a page.
- Aggregates (heatmap, ledger scan, readiness, account status) are pure functions in `src/engine/review.ts`;
  commentary, follow-up drafts and journal proposals are in `src/engine/{commentary,followup,journals}.ts`.
  Keep new logic there with tests, and keep pages to formatting and drilling.
- Any document reference opens the item drawer: use `<DocLink itemKey>` (`useItemDrawer`). The drawer is
  non-modal on purpose - it must not block the top bar.
- Filters live in the URL (`useQueryParams`); each tab uses its own param names.
- Data generator: new categories need a "settled in the quarter" maker in `src/data/generator/settled.ts`
  or their quarterly movement will look wrong.

## Reconciliations (I4)
- Reconciliations are generated from the ledger (`src/data/generator/recs.ts`): books balances come from
  `closingFromLines`, counterparty balances from open items, differences from real lines (open lines with
  no partner, retention, short-payment residuals, FX revaluation) plus the planted S-18/S-19/S-25 data.
- Semantics are in `src/engine/recs.ts` (see FRD D-23 to D-26): difference = books less source; an item's
  effect is +amount (books side) or -amount (source side); unexplained = difference less classified effects;
  tolerance per type is in `RECON_POLICY`. Classes and treatments per type are `src/engine/recClasses.ts`.
  The customer diagnosis is `src/engine/diagnose.ts` (pure; exact subset only, never a guess).
- The session's work on a reconciliation lives in `useWorkflow().recs` (`RecWork`); read everything through
  `useRecRows()` / `useRecRow()` (`src/state/recHooks.ts`), never recompute a view in a page.
- A reconciling item is addressed `REC-id::item-id` (`recItemKey`). Decisions and follow-ups on it use the
  normal workflow actions; the entry is a decision with a `journal` (`adjustmentJournal`), exported by
  `src/engine/journals.ts`. Sign-offs of reconciliations share `signOffs`, keyed by reconciliation id.
- The item drawer shows both kinds of item (`RecItemBody`); shared pieces are in
  `components/review/drawerParts.tsx`. `StatusBars` is generic over its rows.
- Wide tables must scroll inside their panel: the shell's scroll viewport is `display: block`
  (`components/ui/scroll-area.tsx`); keep table columns within about 1050px at 1366 wide.

## Cash Application and TDS (I5)
- The matcher is pure (`src/engine/cashapp.ts`): receipts are the open credits on 171200; `cashappData.ts`
  reads invoices (with the value excluding GST), usual withholding rates and legal entities from the world.
  Policy is `CASH_APP_POLICY`; every proposal satisfies receipt + deductions + unexplained = invoices, and
  its confidence is the sum of met factor weights. Do not add a deduction the policy does not list.
- Read receipts through `useCashApp()` (`src/state/cashAppHooks.ts`), which applies decisions, parking and
  rejections via `computeMatches`; never run the matcher in a page. Actions are `confirmMatch(es)`,
  `rejectMatch`, `parkReceipt` in the workflow store: a confirmed match is a decision "Apply receipt" on the
  receipt line key, carrying its journal (`applicationJournal`) and `clears`; its invoices are then held.
- Reconciliations link in: the customer-statement diagnosis takes `unappliedFor(customerId)`; an item with
  class `receipt-unapplied` is documented by the cash-application decision on its `lineKey`.
- TDS: one allocator (`src/engine/tds.ts`) serves BSR-07 and the screens, over `ctx.tdsLines` (open and
  claimed deductions); `tdsAnalysis.ts` caches it per parameter set, `useTds()` reads the BSR-07 parameters
  so Rules & Policies changes show here. Expected credits come from the matcher's proposals.
- Invoice references must stay unique (`nextInvoiceRef` runs per business-unit code and year): the matcher
  and the customer statements resolve an invoice by its reference.
- Tests run one file at a time (`vite.config.ts`): every file generates the whole world.

## Journals and Audit Readiness (I6)
- Journals are grouped from the universal journal (`journalDocs`, `src/engine/journalReview.ts`), keyed
  `${fiscalYear}-${docNo}` (never a line key). The five checks JNL-01 to JNL-05 are deterministic, apply to
  manual journals only, and read their thresholds from `JOURNAL_REVIEW_POLICY`; a flag is a reason to look,
  not a verdict. Read journals through `useJournals()` (`src/state/journalHooks.ts`).
- The reviewer's conclusion is `reviewJournal` (accept, or request support, which also raises a follow-up to the
  preparer); the reviewer must differ from the person who entered the journal (`userId` against `enteredBy`).
  Journals > Proposed lists every decision that makes an entry (`buildProposal`), whichever module raised it,
  and reuses `DecisionQueue`.
- Audit Readiness: the request list is `src/data/workspace/pbc.ts`; a request with a `link` takes its progress
  from sign-offs (`src/engine/audit.ts`) and cannot be provided until that work is signed off. Schedules are
  assembled by `buildSchedule` (`src/state/auditHooks.ts`) from the review model and the reconciliation rows,
  laid out by `src/engine/schedule.ts` (Appendix D) and written by the dependency-free `src/lib/xlsx.ts`.
  Do not build a figure for a schedule anywhere else: it must be the figure the review shows.
- The review model and the reconciliation rows are pure functions (`buildReview`, `buildRecRows`) so engine
  tests can build the same models the pages read; the hooks only memoise them.
- Status words live in `src/lib/status.ts` (the chip and the exports use the same labels).

## Home, My Work and Close Cockpit (I7)
- The close plan is data (`src/data/workspace/close.ts`); the orchestrator is pure (`src/engine/close.ts`):
  a task derives its status from a record (`deriveProgress`) or is completed by hand with a reference; late,
  projected finish, critical path and the area cell state all come from there. Working days are
  `src/lib/workdays.ts` over the localisation calendar. Do not compute a close figure in a page.
- One close model for every screen: `buildCloseModel` (`src/state/closeModel.ts`), read through `useClose()`.
  My Work (`workModel.ts`, `useWork()`) and Home (`homeModel.ts`, `useHome()`) are pure functions over the same
  models; `src/test/models.ts` builds them for tests. Add a queue kind or an attention kind there, with a test.
- These screens are company-wide: use `useCompanyReview()` and `useJournals(true)`, not the business-unit scoped
  ones. Business unit attribution is `src/engine/attribution.ts`.
- Write actions are in the workflow store (`closeWork`, `completeCloseTask`, `flagCloseBlocker`, ...); the queue
  must never offer an action the acting role cannot take (see the rules in `buildWork`).
- Every model has a pure builder (`buildReview`, `buildRecRows`, `buildJournals`, `buildCashApp`): hooks only
  memoise them.

## Reporting (I8)
- The report lines are one cube, `src/engine/pl.ts` (`plMonth`, `plRange`, `operatingResult`, scope by company,
  business unit or profit centre). Variance (`variance.ts`), Management Reporting (`management.ts`) and Working
  Capital (`workingCapital.ts`) read it; the statements (`financials.ts`) read the trial balance. The two routes
  are tested against each other. Never compute a figure in a page: add it to an engine and test it.
- The operating result is defined once (FRD D-46). The variance bridge sums exactly to the change (FR-VAR-01,
  `bridge().residual`); a new component must keep it at zero for every scope, month and comparator.
- The budget is derived (`budget.ts`, D-47), not stored, and exists for the budget year only; check `hasBudget` /
  `canCompare` before offering it.
- New data that must not move the rest of the world is planted with `unit()` (a hash of the record,
  `src/data/generator/pricing.ts`), never with `ctx.rng`, and before `postMonthlyActivity` when the monthly
  summaries must be sized around it. Priced receipts, project estimates and exchange differences work this way.
- Working capital balances and the balance sheet comparative are limited to the previous quarter end (D-50,
  parked item P-02); days of inventory are the company's only (D-51).
- Charts: waterfalls are `components/reporting/Waterfall.tsx` (floating bars, sign in the tooltip and the table
  beside it); statements are `StatementTable.tsx`. A truncated chart label must show its full text in the
  tooltip (`labelFormatter`).
- Variance commentary and explanation requests go through the workflow store (`saveVarianceNote`,
  `discardVarianceNote`, `requestFollowUp`), each checking `can()` and logging an event.

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
