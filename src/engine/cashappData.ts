// What the matcher reads from the loaded world: open customer invoices (with the
// value excluding GST), the withholding rate each customer usually deducts, the
// accounts that belong to one legal entity, and the receipts waiting in
// incoming-payments clearing.

import type { IsoDate, LineItem } from "@/types";
import { GL_BY_ID, LINES_BY_DOC, WORLD, isOpenAt } from "@/data";
import { CASH_APP_POLICY } from "@/config/policies";
import { matchAll, nameTokensOf, type CashAppData, type InvoiceRef, type Match, type Receipt } from "@/engine/cashapp";
import type { UnappliedReceipt } from "@/engine/diagnose";

export const CLEARING_GL = "171200";

const cache = new Map<IsoDate, CashAppData>();

/** Value of an invoice excluding GST: the revenue legs of its document. */
function taxableOf(l: LineItem): number {
  const doc = LINES_BY_DOC.get(`${l.fiscalYear}-${l.docNo}`) ?? [];
  const revenue = doc.filter((x) => x.key !== l.key && GL_BY_ID.get(x.gl)?.category === "pl" && x.amount < 0).reduce((s, x) => s - x.amount, 0);
  return revenue > 0 ? revenue : Math.round(l.amount / 1.18);
}

export function buildCashAppData(asOf: IsoDate = WORLD.asOf): CashAppData {
  const hit = cache.get(asOf);
  if (hit) return hit;

  const customers = WORLD.parties.filter((p) => p.type === "Customer" && p.country === "IN");
  const nameTokens = new Map(customers.map((c) => [c.id, nameTokensOf(c.name)]));

  const invoicesByCustomer = new Map<string, InvoiceRef[]>();
  const invoiceByRef = new Map<string, InvoiceRef>();
  const taxableByRef = new Map<string, number>();
  for (const l of WORLD.lines) {
    if (l.gl !== "140100" || l.docType !== "DR" || l.amount <= 0 || l.partner?.type !== "Customer" || l.postingDate > asOf) continue;
    const ref = l.assignment ?? l.reference;
    if (!ref) continue;
    const taxable = taxableOf(l);
    taxableByRef.set(ref, taxable);
    if (!isOpenAt(l, asOf)) continue;
    const inv: InvoiceRef = {
      key: l.key, docNo: l.docNo, reference: ref, customerId: l.partner.id, date: l.postingDate, dueDate: l.dueDate, gross: l.amount, taxable, profitCentre: l.profitCentre, wbs: l.wbs,
    };
    invoiceByRef.set(ref.toUpperCase(), inv);
    const list = invoicesByCustomer.get(l.partner.id);
    if (list) list.push(inv);
    else invoicesByCustomer.set(l.partner.id, [inv]);
  }
  for (const list of invoicesByCustomer.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  // legal entities: accounts that share a tax ID
  const byTaxId = new Map<string, string[]>();
  for (const c of customers) byTaxId.set(c.taxIdMasked, [...(byTaxId.get(c.taxIdMasked) ?? []), c.id]);
  const entityOf = new Map<string, string[]>();
  for (const ids of byTaxId.values()) for (const id of ids) entityOf.set(id, ids);

  // the rate each customer usually deducts, from the tax it has deducted against its invoices before
  const counts = new Map<string, Map<number, number>>();
  for (const l of WORLD.lines) {
    if (l.gl !== "161100" || l.amount <= 0 || l.partner?.type !== "Customer" || !l.assignment || l.postingDate > asOf) continue;
    const taxable = taxableByRef.get(l.assignment);
    if (!taxable) continue;
    const observed = l.amount / taxable;
    const rate = CASH_APP_POLICY.tdsRates.find((r) => Math.abs(observed - r) <= r * 0.15);
    if (rate === undefined) continue;
    const m = counts.get(l.partner.id) ?? new Map<number, number>();
    m.set(rate, (m.get(rate) ?? 0) + 1);
    counts.set(l.partner.id, m);
  }
  const usualRate = new Map<string, number>();
  for (const [id, m] of counts) usualRate.set(id, [...m.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0]);

  const data: CashAppData = { asOf, customers, nameTokens, invoicesByCustomer, invoiceByRef, entityOf, usualRate };
  cache.set(asOf, data);
  return data;
}

let receiptIndex: Map<string, Receipt> | undefined;

export function receiptByKey(key: string): Receipt | undefined {
  receiptIndex ??= new Map(openReceipts().map((r) => [r.key, r]));
  return receiptIndex.get(key);
}

let base: Map<string, Match> | undefined;

/** Every waiting receipt matched with no session decisions applied: what the matcher proposes at the start. */
export function baseMatches(): Map<string, Match> {
  base ??= matchAll(openReceipts(), buildCashAppData());
  return base;
}

/** Receipts the matcher confidently ties to this customer: money received that our books still show as open invoices. */
export function unappliedFor(customerId: string): UnappliedReceipt[] {
  const out: UnappliedReceipt[] = [];
  for (const m of baseMatches().values()) {
    const best = m.proposals[0];
    if (!best || best.customerId !== customerId || best.confidence < CASH_APP_POLICY.proposeFrom || best.residual > 0) continue;
    out.push({
      key: m.receipt.key, date: m.receipt.date, utr: m.receipt.utr, amount: m.receipt.amount, invoiceRefs: best.invoices.map((i) => i.reference),
      invoiceTotal: m.receipt.amount + best.deductions.reduce((s, d) => s + d.amount, 0), confidence: best.confidence,
    });
  }
  return out;
}

/** Receipts waiting in incoming-payments clearing: open credit items, oldest first. */
export function openReceipts(asOf: IsoDate = WORLD.asOf): Receipt[] {
  return WORLD.lines
    .filter((l) => l.gl === CLEARING_GL && l.amount < 0 && l.postingDate <= asOf && isOpenAt(l, asOf))
    .map((l) => ({
      key: l.key, docNo: l.docNo, amount: -l.amount, date: l.postingDate, utr: l.assignment, narration: l.text ?? "", profitCentre: l.profitCentre,
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.key.localeCompare(b.key));
}
