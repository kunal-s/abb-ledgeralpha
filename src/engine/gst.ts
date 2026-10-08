// Indirect tax (docs/FRD.md §6.11, D-63): the input credit in the books
// matched, invoice by invoice, against what the suppliers reported in the
// inward supply statement (GSTR-2B in the India pack). A credit is claimed
// only for supplies that are in both, so the gap between the two is credit
// the company cannot yet use or has not yet recorded.

import type { GstStatementLine, IsoDate, LineItem } from "@/types";
import { LINES_BY_DOC, PARTY_BY_ID, WORLD, isOpenAt } from "@/data";
import { GST_INPUT } from "@/data/generator/reference";
import { daysBetween, fiscalYearStartDate } from "@/lib/dates";
import { TENANT } from "@/config/tenant";

export const GST_POLICY = {
  /** a tax difference up to this many rupees is rounding, not a mismatch */
  tolerance: 1,
  /** input credit is lost if the supplier is not paid within this many days of the invoice */
  paymentDays: 180,
} as const;

export interface BookInvoice {
  docKey: string;
  apKey: string;
  vendorId: string;
  name: string;
  gstin: string;
  ref: string;
  date: IsoDate;
  period: string;
  taxable: number;
  tax: number;
}

const LEGS = new Set<string>(Object.values(GST_INPUT));
const taxOf = (l: GstStatementLine) => l.igst + l.cgst + l.sgst;

/** Supplier invoices of the fiscal year to date that carry input credit, from the books. */
export function bookInvoices(asOf: IsoDate = WORLD.asOf): BookInvoice[] {
  const from = fiscalYearStartDate(asOf, TENANT.fiscalYear.startMonth);
  const out: BookInvoice[] = [];
  for (const [docKey, lines] of LINES_BY_DOC) {
    const ap = lines.find((l) => l.gl === "210100" && l.partner?.type === "Vendor");
    if (!ap || ap.docType !== "KR" || ap.postingDate < from || ap.postingDate > asOf || !ap.reference) continue;
    const tax = lines.filter((l) => LEGS.has(l.gl)).reduce((s, l) => s + l.amount, 0);
    if (tax === 0) continue;
    const vendor = PARTY_BY_ID.get(ap.partner!.id);
    if (!vendor?.indirectTaxIdMasked) continue;
    out.push({
      docKey, apKey: ap.key, vendorId: vendor.id, name: vendor.name, gstin: vendor.indirectTaxIdMasked, ref: ap.reference, date: ap.postingDate, period: ap.postingDate.slice(0, 7),
      taxable: lines.filter((l) => l.gl !== "210100" && !LEGS.has(l.gl)).reduce((s, l) => s + l.amount, 0), tax,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.docKey.localeCompare(b.docKey));
}

export type MatchClass = "matched" | "different" | "missing-in-statement" | "missing-in-books";

export const CLASS_LABELS: Record<MatchClass, string> = {
  matched: "Matched",
  different: "Different tax",
  "missing-in-statement": "In the books, not in the statement",
  "missing-in-books": "In the statement, not in the books",
};

export interface GstMatch {
  cls: MatchClass;
  period: string;
  book?: BookInvoice;
  stmt?: GstStatementLine;
  booksTax: number;
  stmtTax: number;
  /** credit the difference puts in question */
  atStake: number;
}

const keyOf = (gstin: string, ref: string) => `${gstin}|${ref}`;

export function reconcile(asOf: IsoDate = WORLD.asOf): GstMatch[] {
  const books = bookInvoices(asOf);
  // a reference can occur more than once for a supplier, so each statement line is used for one invoice only
  const stmt = new Map<string, GstStatementLine[]>();
  for (const s of WORLD.gstStatement) {
    if (s.invoiceDate > asOf) continue;
    const k = keyOf(s.supplierGstin, s.invoiceRef);
    const list = stmt.get(k);
    if (list) list.push(s);
    else stmt.set(k, [s]);
  }
  const used = new Set<string>();
  const out: GstMatch[] = [];
  for (const b of books) {
    const candidates = (stmt.get(keyOf(b.gstin, b.ref)) ?? []).filter((c) => !used.has(c.id));
    // the closest statement line to the invoice, by tax
    const s = candidates.sort((x, y) => Math.abs(taxOf(x) - b.tax) - Math.abs(taxOf(y) - b.tax))[0];
    if (!s) {
      out.push({ cls: "missing-in-statement", period: b.period, book: b, booksTax: b.tax, stmtTax: 0, atStake: b.tax });
      continue;
    }
    used.add(s.id);
    const d = Math.abs(b.tax - taxOf(s));
    out.push({ cls: d <= GST_POLICY.tolerance && Math.abs(b.taxable - s.taxable) <= GST_POLICY.tolerance ? "matched" : "different", period: b.period, book: b, stmt: s, booksTax: b.tax, stmtTax: taxOf(s), atStake: d });
  }
  for (const list of stmt.values()) for (const s of list) if (!used.has(s.id)) out.push({ cls: "missing-in-books", period: s.period, stmt: s, booksTax: 0, stmtTax: taxOf(s), atStake: taxOf(s) });
  return out;
}

export interface PeriodRow {
  period: string;
  booksTax: number;
  stmtTax: number;
  /** credit that can be claimed: supplies in both, at the lower of the two taxes */
  available: number;
  byClass: Record<MatchClass, { count: number; atStake: number }>;
}

const emptyClasses = () => ({ matched: { count: 0, atStake: 0 }, different: { count: 0, atStake: 0 }, "missing-in-statement": { count: 0, atStake: 0 }, "missing-in-books": { count: 0, atStake: 0 } });

export function byPeriod(matches: GstMatch[]): PeriodRow[] {
  const rows = new Map<string, PeriodRow>();
  for (const m of matches) {
    const r = rows.get(m.period) ?? { period: m.period, booksTax: 0, stmtTax: 0, available: 0, byClass: emptyClasses() };
    r.booksTax += m.booksTax;
    r.stmtTax += m.stmtTax;
    if (m.cls === "matched" || m.cls === "different") r.available += Math.min(m.booksTax, m.stmtTax);
    r.byClass[m.cls].count += 1;
    r.byClass[m.cls].atStake += m.atStake;
    rows.set(m.period, r);
  }
  return [...rows.values()].sort((a, b) => a.period.localeCompare(b.period));
}

export interface ReturnRow {
  period: string;
  dueDate: IsoDate;
  filedOn?: IsoDate;
  status: "on-time" | "late" | "due" | "overdue";
  daysLate: number;
  booksTax: number;
  available: number;
}

export function returnsTracker(asOf: IsoDate, periods: PeriodRow[]): ReturnRow[] {
  const byP = new Map(periods.map((p) => [p.period, p]));
  return WORLD.gstReturns.map((r) => {
    const late = r.filedOn ? Math.max(0, daysBetween(r.dueDate, r.filedOn)) : 0;
    const status: ReturnRow["status"] = r.filedOn ? (late > 0 ? "late" : "on-time") : r.dueDate < asOf ? "overdue" : "due";
    const p = byP.get(r.period);
    return { period: r.period, dueDate: r.dueDate, filedOn: r.filedOn, status, daysLate: late, booksTax: p?.booksTax ?? 0, available: p?.available ?? 0 };
  });
}

export interface RiskItem {
  line: LineItem;
  name: string;
  tax: number;
  days: number;
}

/** Supplier invoices with input credit still unpaid beyond the payment window: the credit has to be reversed if they stay unpaid. */
export function creditAtRisk(asOf: IsoDate = WORLD.asOf): RiskItem[] {
  const out: RiskItem[] = [];
  for (const l of WORLD.lines) {
    if (l.gl !== "210100" || l.amount >= 0 || !l.partner || l.postingDate > asOf || !isOpenAt(l, asOf)) continue;
    const vendor = PARTY_BY_ID.get(l.partner.id);
    if (!vendor?.indirectTaxIdMasked) continue;
    const days = daysBetween(l.documentDate, asOf);
    if (days <= GST_POLICY.paymentDays) continue;
    const lines = LINES_BY_DOC.get(`${l.fiscalYear}-${l.docNo}`) ?? [];
    out.push({ line: l, name: vendor.name, tax: lines.filter((x) => LEGS.has(x.gl)).reduce((s, x) => s + x.amount, 0), days });
  }
  return out.sort((a, b) => b.tax - a.tax);
}

export interface TdsCredit {
  customerId: string;
  name: string;
  balance: number;
  count: number;
  oldest: number;
}

/** Tax deducted at source by government customers on GST, held as a receivable until it is credited. */
export function gstTdsCredits(asOf: IsoDate = WORLD.asOf): TdsCredit[] {
  const m = new Map<string, TdsCredit>();
  for (const l of WORLD.lines) {
    if (l.gl !== "162400" || l.postingDate > asOf || !isOpenAt(l, asOf)) continue;
    const id = l.partner?.id ?? "none";
    const e = m.get(id) ?? { customerId: id, name: l.partner ? PARTY_BY_ID.get(l.partner.id)?.name ?? id : "No customer", balance: 0, count: 0, oldest: 0 };
    e.balance += l.amount;
    e.count += 1;
    e.oldest = Math.max(e.oldest, daysBetween(l.postingDate, asOf));
    m.set(id, e);
  }
  return [...m.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}
