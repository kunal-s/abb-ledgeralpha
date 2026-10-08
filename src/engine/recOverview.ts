// Figures behind the Reconciliations overview: where the money is unexplained,
// how much of the work the reconciler did, and who holds what (docs/FRD.md §6.7, D-50).
// Pure over the reconciliation views, so the page and the tests read the same numbers.

import type { AccountReviewStatus, ReconType, Reconciliation } from "@/types";
import type { RecView } from "@/engine/recs";

interface RowLike {
  rec: Reconciliation;
  view: RecView;
  status: AccountReviewStatus;
}

export interface TypeDifference {
  type: ReconType;
  total: number;
  signed: number;
  /** gross difference between books and source */
  difference: number;
  /** the part of it that classified items account for */
  explained: number;
  /** what is left outside the tolerance */
  unexplained: number;
  outside: number;
}

/** Gross difference by reconciliation type, split into what is explained and what is still open. */
export function typeDifferences(rows: RowLike[], order: readonly ReconType[]): TypeDifference[] {
  const map = new Map<ReconType, TypeDifference>(order.map((t) => [t, { type: t, total: 0, signed: 0, difference: 0, explained: 0, unexplained: 0, outside: 0 }]));
  for (const r of rows) {
    const t = map.get(r.rec.type)!;
    t.total += 1;
    if (r.status === "reviewer-signed") t.signed += 1;
    const d = r.view.difference;
    if (d === null) continue;
    const open = r.view.withinTolerance ? 0 : Math.abs(r.view.unexplained ?? 0);
    t.difference += Math.abs(d);
    t.unexplained += open;
    t.explained += Math.max(0, Math.abs(d) - open);
    if (open > 0) t.outside += 1;
  }
  return [...map.values()];
}

export interface ReconcilerSummary {
  items: number;
  classified: number;
  /** classified by the reconciler and left as it suggested */
  byReconciler: number;
  /** items the reconciler did not classify: a person has to */
  needPerson: number;
  /** mean confidence over the suggestions in use */
  confidence: number;
}

export function reconcilerSummary(rows: RowLike[]): ReconcilerSummary {
  let items = 0;
  let classified = 0;
  let byReconciler = 0;
  let conf = 0;
  for (const r of rows) {
    for (const i of r.view.items) {
      items += 1;
      if (!i.cls) continue;
      classified += 1;
      if (i.suggestedClass && i.suggestedClass === i.classId) {
        byReconciler += 1;
        conf += i.confidence ?? 0;
      }
    }
  }
  return { items, classified, byReconciler, needPerson: items - classified, confidence: byReconciler ? Math.round((conf / byReconciler) * 100) / 100 : 0 };
}

export interface PreparerLoad {
  preparerId: string;
  total: number;
  signed: number;
  outside: number;
  unexplained: number;
}

/** Reconciliations held by each preparer, most open value first. */
export function preparerWorkload(rows: RowLike[]): PreparerLoad[] {
  const map = new Map<string, PreparerLoad>();
  for (const r of rows) {
    const p = map.get(r.rec.preparerId) ?? { preparerId: r.rec.preparerId, total: 0, signed: 0, outside: 0, unexplained: 0 };
    p.total += 1;
    if (r.status === "reviewer-signed") p.signed += 1;
    if (r.view.unexplained !== null && !r.view.withinTolerance && r.status !== "reviewer-signed") {
      p.outside += 1;
      p.unexplained += Math.abs(r.view.unexplained);
    }
    map.set(r.rec.preparerId, p);
  }
  return [...map.values()].sort((a, b) => b.unexplained - a.unexplained || b.total - a.total);
}
