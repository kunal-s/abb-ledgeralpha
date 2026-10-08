// How the demo workspace's budget is set (docs/FRD.md §5.5). The budget for a
// profit centre and month is its planned revenue (the world's plan, with
// seasonality) and the cost ratios of the first half of the year, less the
// savings the plan assumed. The engine builds the figures from the ledger and
// this definition, so the budget and the actuals always cover the same lines.

export const BUDGET_PLAN = {
  version: "FY2026 plan, reset at the half year",
  /** the months whose cost ratios the plan carries forward */
  basisFrom: "2026-01",
  basisTo: "2026-06",
  /** the plan assumes material is bought this much cheaper than the first half cost */
  materialSaving: 0.015,
  otherExpensesSaving: 0.03,
  /** the months the budget covers */
  from: "2026-01",
  to: "2026-12",
} as const;
