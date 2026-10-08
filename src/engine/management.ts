// Management reporting (docs/FRD.md §6.14): results by business unit and
// profit centre against the prior month and the budget, and the margin of
// each project under way. Reads the same report lines as the variance
// analysis and the same ledger as the statements.

import type { IsoDate, Project } from "@/types";
import { PROJECT_BY_WBS, WORLD } from "@/data";
import { TENANT } from "@/config/tenant";
import { budgetMonth, budgetRange } from "@/engine/budget";
import { plMonth, plRange, previousMonth, scopePcs, type PlRow } from "@/engine/pl";
import { fiscalYearMonths } from "@/engine/financials";

export interface ResultRow {
  id: string;
  label: string;
  level: "company" | "bu" | "pc";
  /** the business unit a profit centre belongs to */
  parentId?: string;
  month: PlRow;
  prior: PlRow;
  budget: PlRow;
  ytd: PlRow;
  ytdBudget: PlRow;
}

function rowFor(id: string, label: string, level: ResultRow["level"], pcs: string[], month: string, parentId?: string): ResultRow {
  const { from } = fiscalYearMonths(`${month}-01`, TENANT.fiscalYear.startMonth);
  return {
    id, label, level, parentId, month: plMonth(month, pcs), prior: plMonth(previousMonth(month), pcs), budget: budgetMonth(month, pcs),
    ytd: plRange(from, month, pcs), ytdBudget: budgetRange(from, month, pcs),
  };
}

/** The company, then each business unit followed by its profit centres. */
export function resultsTable(month: string): ResultRow[] {
  const out: ResultRow[] = [rowFor("company", "The company", "company", scopePcs({ kind: "company" }), month)];
  for (const bu of WORLD.businessUnits) {
    out.push(rowFor(bu.id, bu.name, "bu", scopePcs({ kind: "bu", id: bu.id }), month));
    for (const pc of WORLD.profitCentres.filter((p) => p.businessUnitId === bu.id)) out.push(rowFor(pc.id, pc.name, "pc", [pc.id], month, bu.id));
  }
  return out;
}

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------
export interface ProjectRow {
  project: Project;
  contractValue: number;
  /** revenue the ledger holds against the project */
  revenueBooked: number;
  costToDate: number;
  estimateAtCompletion: number;
  /** cost to date over the estimate: the input method of Ind AS 115 */
  percentComplete: number;
  /** the contract value times the percentage complete */
  revenueEarned: number;
  /** earned less booked: positive is revenue still to bill (a contract asset), negative is billed ahead */
  unbilled: number;
  /** contract value less the estimate */
  marginAtCompletion: number;
  marginPercent: number;
  /** the margin a month earlier, and the change in the estimate in the month */
  priorMarginPercent?: number;
  estimateChange: number;
  /** margin at completion at each month end, oldest first */
  trend: { monthEnd: IsoDate; marginPercent: number }[];
}

let bookedCache: Map<string, number> | undefined;

function revenueBooked(): Map<string, number> {
  if (bookedCache) return bookedCache;
  const m = new Map<string, number>();
  for (const l of WORLD.lines) {
    if (!l.wbs || (l.gl !== "410200" && l.gl !== "410300")) continue;
    m.set(l.wbs, (m.get(l.wbs) ?? 0) - l.amount);
  }
  bookedCache = m;
  return m;
}

/** The projects with an estimate at the date, those whose margin fell most first. */
export function projectRows(asOf: IsoDate = WORLD.asOf): ProjectRow[] {
  const byProject = new Map<string, typeof WORLD.projectEstimates>();
  for (const e of WORLD.projectEstimates) {
    if (e.monthEnd > asOf) continue;
    const list = byProject.get(e.wbs) ?? [];
    list.push(e);
    byProject.set(e.wbs, list);
  }
  const booked = revenueBooked();
  const rows: ProjectRow[] = [];
  for (const [wbs, list] of byProject) {
    const project = PROJECT_BY_WBS.get(wbs);
    if (!project) continue;
    list.sort((a, b) => a.monthEnd.localeCompare(b.monthEnd));
    const last = list[list.length - 1];
    const prev = list[list.length - 2];
    const marginPct = (e: { estimateAtCompletion: number }) => (project.contractValue - e.estimateAtCompletion) / project.contractValue;
    const percentComplete = last.estimateAtCompletion > 0 ? Math.min(1, last.costToDate / last.estimateAtCompletion) : 0;
    const revenueEarned = percentComplete * project.contractValue;
    rows.push({
      project, contractValue: project.contractValue, revenueBooked: booked.get(wbs) ?? 0, costToDate: last.costToDate, estimateAtCompletion: last.estimateAtCompletion,
      percentComplete, revenueEarned, unbilled: revenueEarned - (booked.get(wbs) ?? 0),
      marginAtCompletion: project.contractValue - last.estimateAtCompletion, marginPercent: marginPct(last),
      priorMarginPercent: prev ? marginPct(prev) : undefined, estimateChange: prev ? last.estimateAtCompletion - prev.estimateAtCompletion : 0,
      trend: list.map((e) => ({ monthEnd: e.monthEnd, marginPercent: marginPct(e) })),
    });
  }
  return rows.sort((a, b) => b.estimateChange - a.estimateChange);
}
