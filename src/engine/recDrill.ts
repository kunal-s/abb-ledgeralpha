// What stands behind a reconciliation's balances, read straight from the ledger
// (docs/FRD.md §6.7, D-50): the sub-ledger as open items by business partner,
// and a supporting schedule's roll-forward from the opening balance.

import type { IsoDate } from "@/types";
import { PARTY_BY_ID, WORLD, isOpenAt } from "@/data";
import { daysBetween } from "@/lib/dates";

export interface PartnerBalance {
  partnerId: string;
  name: string;
  balance: number;
  count: number;
  oldest: number;
  /** open value older than 90 days, gross */
  over90: number;
}

export interface SubLedgerView {
  partners: PartnerBalance[];
  /** the sub-ledger balance: open items that carry a business partner */
  total: number;
  /** open items on the control account with no partner: they are in the books but not in the sub-ledger */
  direct: { count: number; total: number };
}

export function subLedgerByPartner(gl: string, asOf: IsoDate = WORLD.asOf): SubLedgerView {
  const map = new Map<string, PartnerBalance>();
  const direct = { count: 0, total: 0 };
  for (const l of WORLD.lines) {
    if (l.gl !== gl || !isOpenAt(l, asOf)) continue;
    if (!l.partner) {
      direct.count += 1;
      direct.total += l.amount;
      continue;
    }
    const age = daysBetween(l.postingDate, asOf);
    const p = map.get(l.partner.id) ?? { partnerId: l.partner.id, name: PARTY_BY_ID.get(l.partner.id)?.name ?? l.partner.id, balance: 0, count: 0, oldest: 0, over90: 0 };
    p.balance += l.amount;
    p.count += 1;
    p.oldest = Math.max(p.oldest, age);
    if (age > 90) p.over90 += Math.abs(l.amount);
    map.set(l.partner.id, p);
  }
  const partners = [...map.values()].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  return { partners, total: partners.reduce((s, p) => s + p.balance, 0), direct };
}

export interface RollforwardLine {
  key: string;
  label: string;
  debit: number;
  credit: number;
  count: number;
}

export interface Rollforward {
  opening: number;
  lines: RollforwardLine[];
  closing: number;
}

const DOC_LABEL: Record<string, string> = {
  SA: "Journals", KR: "Vendor invoices", KZ: "Vendor payments", KA: "Vendor documents", DR: "Customer invoices", DZ: "Customer receipts",
  WE: "Goods receipts", RE: "Invoice receipts", AB: "Clearing and reversals",
};

/** Opening balance plus the period's postings by document type equals the closing balance. */
export function rollforward(gl: string, priorDate: IsoDate, asOf: IsoDate = WORLD.asOf): Rollforward {
  let opening = 0;
  const by = new Map<string, RollforwardLine>();
  for (const l of WORLD.lines) {
    if (l.gl !== gl || l.postingDate > asOf) continue;
    if (l.postingDate <= priorDate) {
      opening += l.amount;
      continue;
    }
    const key = l.manual ? "manual" : l.docType;
    const row = by.get(key) ?? { key, label: l.manual ? "Manual journals" : (DOC_LABEL[l.docType] ?? `Document type ${l.docType}`), debit: 0, credit: 0, count: 0 };
    if (l.amount >= 0) row.debit += l.amount;
    else row.credit += -l.amount;
    row.count += 1;
    by.set(key, row);
  }
  const lines = [...by.values()].sort((a, b) => b.debit + b.credit - (a.debit + a.credit));
  return { opening, lines, closing: opening + lines.reduce((s, r) => s + r.debit - r.credit, 0) };
}

export interface PoBalance {
  po: string;
  vendor: string;
  status: string;
  /** goods received, not invoiced (credit, signed as in the ledger) */
  received: number;
  /** invoiced, not received (debit) */
  invoiced: number;
  net: number;
  count: number;
  lastGr?: IsoDate;
  lastInvoice?: IsoDate;
}

export interface GrirView {
  orders: PoBalance[];
  total: number;
}

/** Open goods receipt and invoice receipt lines of a GR/IR account, by purchase order. */
export function grirByPo(gl: string, asOf: IsoDate = WORLD.asOf): GrirView {
  const status = new Map(WORLD.purchaseOrders.map((p) => [p.po, p]));
  const map = new Map<string, PoBalance>();
  for (const l of WORLD.lines) {
    if (l.gl !== gl || !l.po || !isOpenAt(l, asOf)) continue;
    const st = status.get(l.po.number);
    const row = map.get(l.po.number) ?? {
      po: l.po.number, vendor: st ? PARTY_BY_ID.get(st.vendorId)?.name ?? st.vendorId : "", status: st?.status ?? "", received: 0, invoiced: 0, net: 0, count: 0,
      lastGr: st?.lastGrDate, lastInvoice: st?.lastInvoiceDate,
    };
    if (l.amount < 0) row.received += l.amount;
    else row.invoiced += l.amount;
    row.net += l.amount;
    row.count += 1;
    map.set(l.po.number, row);
  }
  const orders = [...map.values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net));
  return { orders, total: orders.reduce((s, o) => s + o.net, 0) };
}
