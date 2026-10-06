// Withholding-tax credits (docs/FRD.md §6.12): the tax customers deducted from
// receipts, set against the tax credit statement (Form 26AS in the India pack).
// One allocator serves the rule that flags missing credits and the TDS screens,
// so they can never disagree. Pure: depends only on what it is given.

import type { IsoDate, LineItem, Party, TaxCreditStatementLine } from "@/types";
import { LOCALISATION } from "@/config/localisation";
import { addDays, daysBetween, fiscalQuarterLabel, fiscalYearOf, monthEnd } from "@/lib/dates";

export const TAX_YEAR_START = LOCALISATION.statutoryTaxYearStartMonth;

/** Last day of the statutory tax-year quarter containing `d` (Jun, Sep, Dec, Mar). */
export function taxQuarterEnd(d: IsoDate): IsoDate {
  const m = Number(d.slice(5, 7));
  const endMonth = Math.ceil(m / 3) * 3;
  return monthEnd(`${d.slice(0, 4)}-${String(endMonth).padStart(2, "0")}-01`);
}

export const taxQuarterOf = (d: IsoDate) => fiscalQuarterLabel(d, TAX_YEAR_START, "FY");

export type TdsCreditStatus = "matched" | "wrong-tan" | "short" | "wrong-quarter" | "missing" | "pending";

export const TDS_STATUS_LABELS: Record<TdsCreditStatus, string> = {
  matched: "Matched",
  "wrong-tan": "Wrong tax ID",
  short: "Short credit",
  "wrong-quarter": "Wrong quarter",
  missing: "Missing",
  pending: "Statement not yet available",
};

export interface TdsAllocation {
  status: TdsCreditStatus;
  quarter: string;
  /** what the statement credits against this deduction */
  credited: number;
  statementId?: string;
  statementQuarter?: string;
}

export interface AllocateParams {
  /** the statement for a quarter is available this many days after it ends */
  statementLagDays: number;
  toleranceAmount: number;
}

/**
 * Allocate statement lines to deductions one to one, per customer and quarter.
 * A deduction is matched, matched under a tax ID that differs from the customer
 * master, short-credited, credited in another quarter, or missing. `unbooked`
 * is every statement line no deduction used.
 */
export function allocateTdsCredits(
  lines: LineItem[],
  creditsByCustomer: Map<string, TaxCreditStatementLine[]>,
  party: Map<string, Party>,
  asOf: IsoDate,
  p: AllocateParams
): { byLine: Map<string, TdsAllocation>; unbooked: TaxCreditStatementLine[] } {
  const byLine = new Map<string, TdsAllocation>();
  const used = new Set<string>();
  const groups = new Map<string, LineItem[]>();
  for (const l of lines) {
    if (l.amount <= 0 || !l.partner) continue;
    const quarter = taxQuarterOf(l.postingDate);
    if (addDays(taxQuarterEnd(l.postingDate), p.statementLagDays) > asOf) {
      byLine.set(l.key, { status: "pending", quarter, credited: 0 });
      continue;
    }
    const k = `${l.partner.id}|${quarter}`;
    const list = groups.get(k);
    if (list) list.push(l);
    else groups.set(k, [l]);
  }

  for (const [k, items] of groups) {
    const [customerId, quarter] = k.split("|");
    const all = creditsByCustomer.get(customerId) ?? [];
    const pool = all.filter((c) => c.taxYearQuarter === quarter);
    const master = party.get(customerId)?.deductorIdMasked;
    const unmatched: LineItem[] = [];
    for (const l of items) {
      const i = pool.findIndex((c) => Math.abs(c.taxCredited - l.amount) <= p.toleranceAmount);
      if (i < 0) {
        unmatched.push(l);
        continue;
      }
      const [c] = pool.splice(i, 1);
      used.add(c.id);
      byLine.set(l.key, { status: master && c.deductorTaxIdMasked !== master ? "wrong-tan" : "matched", quarter, credited: c.taxCredited, statementId: c.id, statementQuarter: c.taxYearQuarter });
    }
    for (const l of unmatched) {
      const si = pool.findIndex((c) => c.taxCredited > 0 && c.taxCredited < l.amount - p.toleranceAmount);
      const short = si >= 0 ? pool.splice(si, 1)[0] : undefined;
      if (short) {
        used.add(short.id);
        byLine.set(l.key, { status: "short", quarter, credited: short.taxCredited, statementId: short.id, statementQuarter: short.taxYearQuarter });
        continue;
      }
      const elsewhere = all.find((c) => c.taxYearQuarter !== quarter && !used.has(c.id) && Math.abs(c.taxCredited - l.amount) <= p.toleranceAmount);
      if (elsewhere) {
        used.add(elsewhere.id);
        byLine.set(l.key, { status: "wrong-quarter", quarter, credited: elsewhere.taxCredited, statementId: elsewhere.id, statementQuarter: elsewhere.taxYearQuarter });
      } else byLine.set(l.key, { status: "missing", quarter, credited: 0 });
    }
  }

  const unbooked: TaxCreditStatementLine[] = [];
  for (const credits of creditsByCustomer.values()) for (const c of credits) if (!used.has(c.id) && c.transactionDate <= asOf) unbooked.push(c);
  return { byLine, unbooked: unbooked.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate)) };
}

/**
 * Where a deduction not yet booked would stand against the statement: looked up
 * among the statement lines no booked deduction has used.
 */
export function checkExpectedCredit(
  customerId: string,
  date: IsoDate,
  amount: number,
  unbooked: TaxCreditStatementLine[],
  party: Map<string, Party>,
  asOf: IsoDate,
  p: AllocateParams
): TdsAllocation {
  const quarter = taxQuarterOf(date);
  if (addDays(taxQuarterEnd(date), p.statementLagDays) > asOf) return { status: "pending", quarter, credited: 0 };
  const mine = unbooked.filter((c) => c.customerId === customerId);
  const master = party.get(customerId)?.deductorIdMasked;
  const same = mine.filter((c) => c.taxYearQuarter === quarter);
  const exact = same.find((c) => Math.abs(c.taxCredited - amount) <= p.toleranceAmount);
  if (exact) return { status: master && exact.deductorTaxIdMasked !== master ? "wrong-tan" : "matched", quarter, credited: exact.taxCredited, statementId: exact.id, statementQuarter: exact.taxYearQuarter };
  const short = same.find((c) => c.taxCredited > 0 && c.taxCredited < amount - p.toleranceAmount);
  if (short) return { status: "short", quarter, credited: short.taxCredited, statementId: short.id, statementQuarter: short.taxYearQuarter };
  const elsewhere = mine.find((c) => c.taxYearQuarter !== quarter && Math.abs(c.taxCredited - amount) <= p.toleranceAmount);
  if (elsewhere) return { status: "wrong-quarter", quarter, credited: elsewhere.taxCredited, statementId: elsewhere.id, statementQuarter: elsewhere.taxYearQuarter };
  return { status: "missing", quarter, credited: 0 };
}

// ---------------------------------------------------------------------------
// Tax deducted by the company (payable side): deducted, deposited, on time?
// ---------------------------------------------------------------------------
export interface PayableRow {
  gl: string;
  /** month of the deduction, "2026-09" */
  month: string;
  deducted: number;
  deposited: number;
  outstanding: number;
  /** deposit due date: the 7th of the following month */
  due: IsoDate;
  depositedOn?: IsoDate;
  status: "deposited" | "deposited-late" | "due" | "overdue";
  /** days after the due date the deposit was made, or has been outstanding */
  daysLate: number;
}

export function tdsPayable(lines: LineItem[], asOf: IsoDate): PayableRow[] {
  const groups = new Map<string, PayableRow>();
  for (const l of lines) {
    if (l.amount >= 0 || l.postingDate > asOf) continue;
    const month = l.postingDate.slice(0, 7);
    const k = `${l.gl}|${month}`;
    const g = groups.get(k) ?? { gl: l.gl, month, deducted: 0, deposited: 0, outstanding: 0, due: addDays(monthEnd(`${month}-01`), 7), status: "due" as const, daysLate: 0 };
    g.deducted += -l.amount;
    if (l.clearing && l.clearing.date <= asOf) {
      g.deposited += -l.amount;
      if (!g.depositedOn || l.clearing.date > g.depositedOn) g.depositedOn = l.clearing.date;
    }
    groups.set(k, g);
  }
  return [...groups.values()]
    .map((g) => {
      const outstanding = g.deducted - g.deposited;
      if (outstanding === 0) {
        const late = g.depositedOn ? daysBetween(g.due, g.depositedOn) : 0;
        return { ...g, outstanding, status: late > 0 ? ("deposited-late" as const) : ("deposited" as const), daysLate: Math.max(0, late) };
      }
      const over = daysBetween(g.due, asOf);
      return { ...g, outstanding, status: over > 0 ? ("overdue" as const) : ("due" as const), daysLate: Math.max(0, over) };
    })
    .sort((a, b) => b.month.localeCompare(a.month) || a.gl.localeCompare(b.gl));
}

/** Tax years between the deduction and the as-at date (0 in the same tax year). */
export const taxYearsElapsed = (date: IsoDate, asOf: IsoDate) => fiscalYearOf(asOf, TAX_YEAR_START) - fiscalYearOf(date, TAX_YEAR_START);

export const CREDIT_AGE_BUCKETS = [
  { id: "0-180", label: "Up to 6 months", max: 180 },
  { id: "181-365", label: "6 to 12 months", max: 365 },
  { id: "1-2y", label: "1 to 2 years", max: 730 },
  { id: "2y+", label: "Over 2 years", max: Infinity },
] as const;

export function creditAgeBucket(date: IsoDate, asOf: IsoDate): (typeof CREDIT_AGE_BUCKETS)[number]["id"] {
  const d = daysBetween(date, asOf);
  return CREDIT_AGE_BUCKETS.find((b) => d <= b.max)!.id;
}
