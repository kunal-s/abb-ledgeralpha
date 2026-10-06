// Period balances (the trial balance) derived from line items, and an
// independent recomputation used to prove the two agree (control totals).
// Year-end close: P&L accounts restart each fiscal year; the prior year's
// result moves to retained earnings.

import type { GlAccount, GlBalance, IsoDate, LineItem } from "@/types";
import { fiscalYearStartDate, monthEnd, monthEndsBetween } from "@/lib/dates";

export const RETAINED_EARNINGS_GL = "320100";

const isPl = (gl: GlAccount) => gl.category === "pl";

export interface BalanceTable {
  periods: IsoDate[];
  /** gl → balances aligned with `periods` */
  byGl: Map<string, GlBalance[]>;
}

export function computeBalances(lines: LineItem[], gls: GlAccount[], asOf: IsoDate, fyStartMonth: number): BalanceTable {
  const first = lines.reduce((m, l) => (l.postingDate < m ? l.postingDate : m), asOf);
  const periods = monthEndsBetween(first, asOf);
  const index = new Map(periods.map((p, i) => [p, i]));
  const dr = new Map<string, Float64Array>();
  const crd = new Map<string, Float64Array>();
  for (const g of gls) {
    dr.set(g.gl, new Float64Array(periods.length));
    crd.set(g.gl, new Float64Array(periods.length));
  }
  for (const l of lines) {
    const i = index.get(monthEnd(l.postingDate));
    if (i === undefined) continue;
    if (l.amount >= 0) dr.get(l.gl)![i] += l.amount;
    else crd.get(l.gl)![i] += l.amount;
  }

  const byGl = new Map<string, GlBalance[]>(gls.map((g) => [g.gl, []]));
  const closing = new Map<string, number>(gls.map((g) => [g.gl, 0]));
  periods.forEach((p, i) => {
    const fyStart = Number(p.slice(5, 7)) === fyStartMonth;
    if (fyStart && i > 0) {
      let result = 0;
      for (const g of gls) {
        if (isPl(g)) {
          result += closing.get(g.gl)!;
          closing.set(g.gl, 0);
        }
      }
      closing.set(RETAINED_EARNINGS_GL, closing.get(RETAINED_EARNINGS_GL)! + result);
    }
    for (const g of gls) {
      const opening = closing.get(g.gl)!;
      const d = dr.get(g.gl)![i];
      const c = crd.get(g.gl)![i];
      const close = opening + d + c;
      closing.set(g.gl, close);
      byGl.get(g.gl)!.push({ gl: g.gl, periodEnd: p, opening, debits: d, credits: c, closing: close });
    }
  });
  return { periods, byGl };
}

export function balanceAt(table: BalanceTable, gl: string, periodEnd: IsoDate): GlBalance | undefined {
  const i = table.periods.indexOf(periodEnd);
  return i < 0 ? undefined : table.byGl.get(gl)?.[i];
}

/**
 * Closing balance recomputed straight from line items, without the period
 * table: balance-sheet accounts cumulate; P&L accounts cumulate within the
 * fiscal year; retained earnings also absorbs every earlier year's P&L.
 */
export function closingFromLines(lines: LineItem[], gls: GlAccount[], periodEnd: IsoDate, fyStartMonth: number): Map<string, { closing: number; lines: number; debits: number; credits: number }> {
  const plSet = new Set(gls.filter(isPl).map((g) => g.gl));
  const fyStart = fiscalYearStartDate(periodEnd, fyStartMonth);
  const out = new Map(gls.map((g) => [g.gl, { closing: 0, lines: 0, debits: 0, credits: 0 }]));
  let priorResult = 0;
  for (const l of lines) {
    if (l.postingDate > periodEnd) continue;
    const row = out.get(l.gl);
    if (!row) continue;
    if (plSet.has(l.gl) && l.postingDate < fyStart) {
      priorResult += l.amount;
      continue;
    }
    row.closing += l.amount;
    row.lines += 1;
    if (l.amount >= 0) row.debits += l.amount;
    else row.credits += l.amount;
  }
  out.get(RETAINED_EARNINGS_GL)!.closing += priorResult;
  return out;
}
