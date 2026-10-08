// The profit and loss as the reporting modules read it: the ledger's income and
// expense lines grouped by month and profit centre into the lines management
// reports on, and the operating result they make up. One pass over the ledger,
// cached; every report, bridge and statement agrees because they all read this.

import type { IsoDate } from "@/types";
import { GL_BY_ID, PC_BY_ID, WORLD } from "@/data";
import { PRICED_REVENUE_GLS } from "@/data/workspace/pricing";

export interface PlRow {
  revenue: number;
  /** the part of revenue priced per unit from the list (products and exports) */
  pricedRevenue: number;
  material: number;
  employee: number;
  depreciation: number;
  /** other expenses, excluding exchange losses and the one-off accounts */
  other: number;
  fxGain: number;
  fxLoss: number;
  oneOffIncome: number;
  oneOffExpense: number;
  /** below the operating result */
  interest: number;
  tax: number;
}

export const emptyRow = (): PlRow => ({ revenue: 0, pricedRevenue: 0, material: 0, employee: 0, depreciation: 0, other: 0, fxGain: 0, fxLoss: 0, oneOffIncome: 0, oneOffExpense: 0, interest: 0, tax: 0 });

/** Accounts whose postings are one-off by nature: liquidated damages, bad debts, liabilities written back. */
export const ONE_OFF_EXPENSE_GLS = ["531300", "531500"];
export const ONE_OFF_INCOME_GLS = ["461500"];
export const FX_LOSS_GL = "531700";
export const FX_GAIN_GL = "462100";

export type PlKey = keyof PlRow;

/** Which line of the report a P&L account feeds, and with which sign (income positive, expense positive). */
function lineOf(gl: string): { key: PlKey; sign: 1 | -1 } | undefined {
  if (gl === FX_GAIN_GL) return { key: "fxGain", sign: -1 };
  if (gl === FX_LOSS_GL) return { key: "fxLoss", sign: 1 };
  if (ONE_OFF_INCOME_GLS.includes(gl)) return { key: "oneOffIncome", sign: -1 };
  if (ONE_OFF_EXPENSE_GLS.includes(gl)) return { key: "oneOffExpense", sign: 1 };
  if (["410100", "410200", "410300", "410400", "450100"].includes(gl)) return { key: "revenue", sign: -1 };
  if (gl === "461100") return { key: "interest", sign: -1 };
  if (gl === "550100") return { key: "tax", sign: 1 };
  if (gl.startsWith("51")) return { key: "material", sign: 1 };
  if (gl.startsWith("52")) return { key: "employee", sign: 1 };
  if (gl === "540100") return { key: "depreciation", sign: 1 };
  if (gl.startsWith("53")) return { key: "other", sign: 1 };
  return undefined;
}

/** The operating result: revenue and the one-off and exchange income, less the costs of operating; interest and tax are below it. */
export const operatingResult = (r: PlRow): number => r.revenue + r.fxGain + r.oneOffIncome - r.material - r.employee - r.depreciation - r.other - r.fxLoss - r.oneOffExpense;

export const margin = (r: PlRow): number | undefined => (r.revenue === 0 ? undefined : operatingResult(r) / r.revenue);

export const addRows = (a: PlRow, b: PlRow): PlRow => {
  const out = emptyRow();
  for (const k of Object.keys(out) as PlKey[]) out[k] = a[k] + b[k];
  return out;
};

let cube: Map<string, PlRow> | undefined;

/** `${month}|${profitCentre}` to the period's row; month is "2026-09". */
function plCube(): Map<string, PlRow> {
  if (cube) return cube;
  const m = new Map<string, PlRow>();
  for (const l of WORLD.lines) {
    if (GL_BY_ID.get(l.gl)?.category !== "pl") continue;
    const line = lineOf(l.gl);
    if (!line) continue;
    const k = `${l.postingDate.slice(0, 7)}|${l.profitCentre}`;
    const row = m.get(k) ?? emptyRow();
    row[line.key] += line.sign * l.amount;
    if (line.key === "revenue" && PRICED_REVENUE_GLS.includes(l.gl)) row.pricedRevenue += -l.amount;
    m.set(k, row);
  }
  cube = m;
  return m;
}

export type Scope = { kind: "company" } | { kind: "bu"; id: string } | { kind: "pc"; id: string };

export const COMPANY: Scope = { kind: "company" };

/** The profit centres a scope covers. */
export function scopePcs(scope: Scope): string[] {
  if (scope.kind === "pc") return [scope.id];
  if (scope.kind === "bu") return WORLD.profitCentres.filter((p) => p.businessUnitId === scope.id).map((p) => p.id);
  return WORLD.profitCentres.map((p) => p.id);
}

export function scopeLabel(scope: Scope): string {
  if (scope.kind === "pc") return PC_BY_ID.get(scope.id)?.name ?? scope.id;
  if (scope.kind === "bu") return WORLD.businessUnits.find((b) => b.id === scope.id)?.name ?? scope.id;
  return "The company";
}

export const scopeKey = (s: Scope): string => (s.kind === "company" ? "company" : `${s.kind}:${s.id}`);

export function parseScope(key: string | null | undefined): Scope {
  if (key?.startsWith("bu:")) return { kind: "bu", id: key.slice(3) };
  if (key?.startsWith("pc:") && PC_BY_ID.has(key.slice(3))) return { kind: "pc", id: key.slice(3) };
  return COMPANY;
}

/** The report lines of one month for some profit centres. */
export function plMonth(month: string, pcs: readonly string[]): PlRow {
  const c = plCube();
  let out = emptyRow();
  for (const pc of pcs) {
    const r = c.get(`${month}|${pc}`);
    if (r) out = addRows(out, r);
  }
  return out;
}

/** The months from `from` to `to`, inclusive: "2026-07" to "2026-09". */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const ey = Number(to.slice(0, 4));
  const em = Number(to.slice(5, 7));
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** The report lines over a range of months. */
export function plRange(from: string, to: string, pcs: readonly string[]): PlRow {
  return monthsBetween(from, to).reduce((acc, m) => addRows(acc, plMonth(m, pcs)), emptyRow());
}

export const monthOf = (d: IsoDate): string => d.slice(0, 7);

/** `month` moved by `n` months. */
export function shiftMonth(month: string, n: number): string {
  const total = Number(month.slice(0, 4)) * 12 + (Number(month.slice(5, 7)) - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export const previousMonth = (month: string): string => shiftMonth(month, -1);
