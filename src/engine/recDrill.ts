// What stands behind a balance, read straight from the ledger (docs/FRD.md §6.7,
// D-50): the sub-ledger as open items by business partner, and an account's
// roll-forward from the opening balance (also read by the review's item screen).

import type { IsoDate, LineItem } from "@/types";
import { GL_BY_ID, PARTY_BY_ID, WORLD, isOpenAt } from "@/data";
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
  /** signed as the ledger holds it (debit positive) */
  amount: number;
  count: number;
}

/**
 * Opening balance, what was added, what was taken out, closing balance. "Added" means
 * postings that move the account further in the direction of its balance (credits on a
 * credit balance), so a reader sees additions and reductions the way a schedule shows them.
 */
export interface Rollforward {
  opening: number;
  additions: RollforwardLine[];
  reductions: RollforwardLine[];
  /** totals, signed as the ledger holds them */
  added: number;
  reduced: number;
  closing: number;
  /** the side the balance sits on, which decides what counts as an addition */
  side: "Dr" | "Cr";
}

const DOC_LABEL: Record<string, string> = {
  SA: "Journals", KR: "Vendor invoices", KZ: "Vendor payments", KA: "Vendor documents", DR: "Customer invoices", DZ: "Customer receipts",
  WE: "Goods receipts", RE: "Invoice receipts", AB: "Clearing and adjustments", ZP: "Payments", DG: "Customer credit notes", KG: "Vendor credit notes",
};

/** A movement's name as a schedule would show it. */
function movementOf(l: LineItem): { key: string; label: string } {
  if (/^reversal\b/i.test(l.text ?? "")) return { key: "reversal", label: "Reversals" };
  if (l.docType === "AF") return /^depreciation\b/i.test(l.text ?? "") ? { key: "depreciation", label: "Depreciation" } : { key: "capitalisation", label: "Capitalisation" };
  if (l.manual) return { key: "manual", label: "Manual journals" };
  return { key: l.docType, label: DOC_LABEL[l.docType] ?? `Document type ${l.docType}` };
}

/** Opening balance plus additions less reductions equals the closing balance, for one account over (prior, asOf]. */
export function rollforward(gl: string, priorDate: IsoDate, asOf: IsoDate = WORLD.asOf, include: (l: LineItem) => boolean = () => true): Rollforward {
  let opening = 0;
  let closing = 0;
  const moves: { line: LineItem; key: string; label: string }[] = [];
  for (const l of WORLD.lines) {
    if (l.gl !== gl || l.postingDate > asOf || !include(l)) continue;
    closing += l.amount;
    if (l.postingDate <= priorDate) opening += l.amount;
    else moves.push({ line: l, ...movementOf(l) });
  }
  const anchor = closing !== 0 ? closing : opening !== 0 ? opening : GL_BY_ID.get(gl)?.normalBalance === "Cr" ? -1 : 1;
  const side = anchor < 0 ? "Cr" : "Dr";
  const additions = new Map<string, RollforwardLine>();
  const reductions = new Map<string, RollforwardLine>();
  for (const m of moves) {
    const adds = side === "Cr" ? m.line.amount < 0 : m.line.amount >= 0;
    const into = adds ? additions : reductions;
    const row = into.get(m.key) ?? { key: m.key, label: m.label, amount: 0, count: 0 };
    row.amount += m.line.amount;
    row.count += 1;
    into.set(m.key, row);
  }
  const sorted = (rows: Map<string, RollforwardLine>) => [...rows.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  const sum = (rows: RollforwardLine[]) => rows.reduce((s, r) => s + r.amount, 0);
  const add = sorted(additions);
  const red = sorted(reductions);
  return { opening, additions: add, reductions: red, added: sum(add), reduced: sum(red), closing, side };
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
