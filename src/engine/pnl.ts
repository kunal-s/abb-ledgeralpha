// The profit and loss as management reads it (docs/FRD.md §6.14, D-55): by
// business unit, by month and by project, always summed from the ledger lines
// so every figure ties to the trial balance. Income is positive, expense is
// positive, and the result is income less expense.

import type { IsoDate, LineItem, Project } from "@/types";
import { PARTY_BY_ID, PC_BY_ID, WORLD } from "@/data";
import { TENANT } from "@/config/tenant";
import { addDays, fiscalYearStartDate, monthEnd } from "@/lib/dates";

export type PlGroup = "revenue" | "otherIncome" | "materials" | "employee" | "depreciation" | "other" | "tax";

const GROUP_OF_LINE: Record<string, PlGroup> = {
  "Revenue from operations": "revenue",
  "Other income": "otherIncome",
  "Cost of materials consumed": "materials",
  "Purchases of stock-in-trade": "materials",
  "Changes in inventories": "materials",
  "Employee benefits expense": "employee",
  "Depreciation and amortisation expense": "depreciation",
  "Other expenses": "other",
  "Tax expense": "tax",
};

const GROUP_OF_GL = new Map<string, PlGroup>();
for (const g of WORLD.glAccounts) {
  const grp = GROUP_OF_LINE[g.statementLine];
  if (g.category === "pl" && grp) GROUP_OF_GL.set(g.gl, grp);
}

export const PL_GROUP_LABELS: Record<PlGroup, string> = {
  revenue: "Revenue",
  otherIncome: "Other income",
  materials: "Materials",
  employee: "Employees",
  depreciation: "Depreciation",
  other: "Other expenses",
  tax: "Tax",
};

export interface PlAmounts {
  revenue: number;
  otherIncome: number;
  materials: number;
  employee: number;
  depreciation: number;
  other: number;
  tax: number;
}

export const emptyPl = (): PlAmounts => ({ revenue: 0, otherIncome: 0, materials: 0, employee: 0, depreciation: 0, other: 0, tax: 0 });

export const grossMargin = (p: PlAmounts) => p.revenue - p.materials;
/** revenue less the costs of running the business, before other income and tax */
export const operatingProfit = (p: PlAmounts) => p.revenue - p.materials - p.employee - p.depreciation - p.other;
export const result = (p: PlAmounts) => operatingProfit(p) + p.otherIncome - p.tax;
export const pct = (part: number, whole: number) => (whole ? part / whole : 0);

function add(p: PlAmounts, group: PlGroup, amount: number) {
  // income accounts carry credits (negative); expense accounts carry debits
  p[group] += group === "revenue" || group === "otherIncome" ? -amount : amount;
}

export const buOfPc = (pc: string) => PC_BY_ID.get(pc)?.businessUnitId ?? "CORP";

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------
export interface Windows {
  /** the fiscal year to date, and the same stretch a year earlier */
  ytd: { from: IsoDate; to: IsoDate };
  prior: { from: IsoDate; to: IsoDate };
}

const yearBack = (iso: IsoDate): IsoDate => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;

export function windowsFor(periodEnd: IsoDate): Windows {
  const from = fiscalYearStartDate(periodEnd, TENANT.fiscalYear.startMonth);
  return { ytd: { from, to: periodEnd }, prior: { from: yearBack(from), to: monthEnd(yearBack(periodEnd)) } };
}

const inWindow = (l: LineItem, w: { from: IsoDate; to: IsoDate }) => l.postingDate >= w.from && l.postingDate <= w.to;

// ---------------------------------------------------------------------------
// By business unit
// ---------------------------------------------------------------------------
export interface BuPl {
  businessUnitId: string;
  name: string;
  current: PlAmounts;
  prior: PlAmounts;
}

export function pnlByBusinessUnit(periodEnd: IsoDate): BuPl[] {
  const w = windowsFor(periodEnd);
  const rows = new Map<string, BuPl>();
  const row = (id: string): BuPl => {
    let r = rows.get(id);
    if (!r) {
      r = { businessUnitId: id, name: WORLD.businessUnits.find((b) => b.id === id)?.name ?? id, current: emptyPl(), prior: emptyPl() };
      rows.set(id, r);
    }
    return r;
  };
  for (const l of WORLD.lines) {
    const g = GROUP_OF_GL.get(l.gl);
    if (!g) continue;
    const cur = inWindow(l, w.ytd);
    const pri = !cur && inWindow(l, w.prior);
    if (!cur && !pri) continue;
    const r = row(buOfPc(l.profitCentre));
    add(cur ? r.current : r.prior, g, l.amount);
  }
  return [...rows.values()].sort((a, b) => b.current.revenue - a.current.revenue);
}

export const sumPl = (parts: PlAmounts[]): PlAmounts => {
  const t = emptyPl();
  for (const p of parts) for (const k of Object.keys(t) as PlGroup[]) t[k] += p[k];
  return t;
};

// ---------------------------------------------------------------------------
// By month
// ---------------------------------------------------------------------------
export interface MonthPl {
  periodEnd: IsoDate;
  total: PlAmounts;
  byBusinessUnit: Record<string, PlAmounts>;
}

export function monthlyPnl(periodEnd: IsoDate, months = 12): MonthPl[] {
  const ends: IsoDate[] = [];
  let e = periodEnd;
  for (let i = 0; i < months; i += 1) {
    ends.unshift(e);
    e = monthEnd(addDays(e.slice(0, 8) + "01", -1));
  }
  const index = new Map(ends.map((d, i) => [d, i]));
  const out: MonthPl[] = ends.map((d) => ({ periodEnd: d, total: emptyPl(), byBusinessUnit: {} }));
  for (const l of WORLD.lines) {
    const g = GROUP_OF_GL.get(l.gl);
    if (!g || l.postingDate > periodEnd) continue;
    const i = index.get(monthEnd(l.postingDate));
    if (i === undefined) continue;
    add(out[i].total, g, l.amount);
    const bu = buOfPc(l.profitCentre);
    add((out[i].byBusinessUnit[bu] ??= emptyPl()), g, l.amount);
  }
  return out;
}

// ---------------------------------------------------------------------------
// By project: revenue recognised and cost booked against the project's WBS
// ---------------------------------------------------------------------------
export interface ProjectMargin {
  project: Project;
  customer: string;
  businessUnitId: string;
  contractValue: number;
  revenue: number;
  cost: number;
  /** false while no cost line carries the project: its margin is not yet known */
  costBooked: boolean;
  margin: number;
  marginPct: number;
  /** the share of the contract recognised as revenue */
  recognised: number;
  /** cost to date over the share recognised: what the project costs if cost keeps pace with revenue */
  estimateAtCompletion: number;
  /** contract value less that estimate */
  marginAtCompletion: number;
}

export function projectMargins(periodEnd: IsoDate): ProjectMargin[] {
  const by = new Map<string, { revenue: number; cost: number }>();
  for (const l of WORLD.lines) {
    if (!l.wbs || l.postingDate > periodEnd) continue;
    const g = GROUP_OF_GL.get(l.gl);
    if (!g) continue;
    const e = by.get(l.wbs) ?? { revenue: 0, cost: 0 };
    if (g === "revenue") e.revenue -= l.amount;
    else if (g === "materials" || g === "employee" || g === "depreciation" || g === "other") e.cost += l.amount;
    by.set(l.wbs, e);
  }
  const out: ProjectMargin[] = [];
  for (const p of WORLD.projects) {
    const e = by.get(p.wbs);
    if (!e || (e.revenue === 0 && e.cost === 0)) continue;
    const recognised = p.contractValue ? e.revenue / p.contractValue : 0;
    const eac = recognised > 0 && e.cost > 0 ? e.cost / recognised : 0;
    out.push({
      project: p,
      customer: PARTY_BY_ID.get(p.customerId)?.name ?? p.customerId,
      businessUnitId: buOfPc(p.profitCentreId),
      contractValue: p.contractValue,
      revenue: e.revenue,
      cost: e.cost,
      costBooked: e.cost > 0,
      margin: e.revenue - e.cost,
      marginPct: pct(e.revenue - e.cost, e.revenue),
      recognised,
      estimateAtCompletion: eac,
      marginAtCompletion: eac ? p.contractValue - eac : 0,
    });
  }
  return out.sort((a, b) => b.revenue - a.revenue);
}
