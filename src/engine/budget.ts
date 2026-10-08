// The budget as report lines: planned revenue and the planned cost ratios,
// per profit centre and month (see src/data/workspace/budget.ts). Built from
// the ledger's first-half ratios, so it needs no data of its own and covers
// the same lines as the actuals.

import { WORLD } from "@/data";
import { BUDGET_PLAN } from "@/data/workspace/budget";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { emptyRow, monthsBetween, plRange, type PlRow } from "@/engine/pl";

interface Plan {
  /** planned revenue by calendar month number, 1 to 12 */
  revenue: number[];
  pricedShare: number;
  materialRatio: number;
  employeeRatio: number;
  depreciationRatio: number;
  otherRatio: number;
  /** corporate has no revenue: its costs are carried as a monthly amount */
  employeeMonthly: number;
  otherMonthly: number;
}

let plans: Map<string, Plan> | undefined;

function buildPlans(): Map<string, Plan> {
  const out = new Map<string, Plan>();
  const basisMonths = monthsBetween(BUDGET_PLAN.basisFrom, BUDGET_PLAN.basisTo).length;
  for (const pc of WORLD.profitCentres) {
    const base = plRange(BUDGET_PLAN.basisFrom, BUDGET_PLAN.basisTo, [pc.id]);
    const spec = S.profitCentres.find((p) => p.id === pc.id);
    const planned = spec ? S.seasonality.map((s) => S.monthlyRevenue2026 * spec.weight * s) : S.seasonality.map(() => 0);
    const r = base.revenue || 1;
    out.set(pc.id, {
      revenue: planned,
      pricedShare: base.revenue ? base.pricedRevenue / base.revenue : 0,
      materialRatio: (base.material / r) * (1 - BUDGET_PLAN.materialSaving),
      employeeRatio: base.employee / r,
      depreciationRatio: base.depreciation / r,
      otherRatio: (base.other / r) * (1 - BUDGET_PLAN.otherExpensesSaving),
      employeeMonthly: base.employee / basisMonths,
      otherMonthly: base.other / basisMonths,
    });
  }
  return out;
}

export const hasBudget = (month: string): boolean => month >= BUDGET_PLAN.from && month <= BUDGET_PLAN.to;

/** The planned report lines of one month for some profit centres; empty outside the budget year. */
export function budgetMonth(month: string, pcs: readonly string[]): PlRow {
  const out = emptyRow();
  if (!hasBudget(month)) return out;
  plans ??= buildPlans();
  const m = Number(month.slice(5, 7)) - 1;
  for (const id of pcs) {
    const p = plans.get(id);
    if (!p) continue;
    const revenue = p.revenue[m];
    out.revenue += revenue;
    out.pricedRevenue += revenue * p.pricedShare;
    if (revenue > 0) {
      out.material += revenue * p.materialRatio;
      out.employee += revenue * p.employeeRatio;
      out.depreciation += revenue * p.depreciationRatio;
      out.other += revenue * p.otherRatio;
    } else {
      out.employee += p.employeeMonthly;
      out.other += p.otherMonthly;
    }
  }
  return out;
}

/** The planned report lines over a range of months. */
export function budgetRange(from: string, to: string, pcs: readonly string[]): PlRow {
  const out = emptyRow();
  for (const m of monthsBetween(from, to)) {
    const b = budgetMonth(m, pcs);
    for (const k of Object.keys(out) as (keyof PlRow)[]) out[k] += b[k];
  }
  return out;
}
