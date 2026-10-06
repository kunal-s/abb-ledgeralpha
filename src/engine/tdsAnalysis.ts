// The withholding-tax credit position at an as-at date, from the loaded world:
// every customer deduction in TDS receivable allocated against the tax credit
// statement, plus what the statement carries that no deduction explains.

import type { IsoDate, LineItem, TaxCreditStatementLine } from "@/types";
import { PARTY_BY_ID, isOpenAt } from "@/data";
import { buildContext } from "@/engine/context";
import { allocateTdsCredits, type AllocateParams, type TdsAllocation } from "@/engine/tds";

export interface TdsAnalysis {
  /** status of every customer deduction (open or claimed) */
  byLine: Map<string, TdsAllocation>;
  /** statement lines no booked deduction explains */
  unbooked: TaxCreditStatementLine[];
  /** deductions still open in TDS receivable, oldest first */
  open: LineItem[];
  creditsByCustomer: Map<string, TaxCreditStatementLine[]>;
}

const cache = new Map<string, TdsAnalysis>();

export function analyseTds(asOf: IsoDate, p: AllocateParams): TdsAnalysis {
  const k = `${asOf}|${p.statementLagDays}|${p.toleranceAmount}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const ctx = buildContext(asOf);
  const { byLine, unbooked } = allocateTdsCredits(ctx.tdsLines, ctx.creditsByCustomer, PARTY_BY_ID, asOf, p);
  const out: TdsAnalysis = { byLine, unbooked, open: ctx.tdsLines.filter((l) => isOpenAt(l, asOf)), creditsByCustomer: ctx.creditsByCustomer };
  cache.set(k, out);
  return out;
}
