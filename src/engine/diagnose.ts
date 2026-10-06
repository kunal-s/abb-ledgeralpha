// The reconciler agent's diagnosis of a customer difference. Given the
// customer's ledger lines and the balance the customer confirms, it looks for
// the combination of ledger items that explains the difference exactly: recent
// invoices the customer has not booked yet, retention the customer carries
// separately, and short-payment residuals (tax deducted or a disputed
// deduction). Pure: depends on the lines it is given, not on loaded data.

import type { IsoDate, LineItem, ReconItem } from "@/types";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINR } from "@/lib/format";

/** A receipt in clearing that Cash Application has matched to this customer's open invoices. */
export interface UnappliedReceipt {
  key: string;
  date: IsoDate;
  utr?: string;
  amount: number;
  invoiceRefs: string[];
  /** the invoices the receipt settles, which our books still show open */
  invoiceTotal: number;
  confidence: number;
}

export interface DiagnoseInput {
  /** every ledger line of the customer on receivables and retention, cleared or open */
  lines: LineItem[];
  booksBalance: number;
  replyBalance: number;
  asOf: IsoDate;
  /** "recent" window for invoices the customer may not have booked yet */
  recentDays?: number;
  unappliedReceipts?: UnappliedReceipt[];
}

export interface Diagnosis {
  items: ReconItem[];
  /** the difference between the books and the reply that was being explained */
  difference: number;
  /** true when a combination explaining the difference exactly was found */
  exact: boolean;
}

const TDS_RATES = [0.001, 0.01, 0.02, 0.05, 0.1];
const GST_FACTOR = 1.18;

interface Candidate {
  item: ReconItem;
}

export function diagnosisCandidates(i: DiagnoseInput): ReconItem[] {
  return candidates(i).map((c) => c.item);
}

function candidates(i: DiagnoseInput): Candidate[] {
  const isOpen = (l: LineItem) => !l.clearing || l.clearing.date > i.asOf;
  const recent = i.recentDays ?? 10;
  const open = i.lines.filter(isOpen);
  const invoiceByRef = new Map<string, LineItem>();
  for (const l of i.lines) if (l.docType === "DR" && l.gl === "140100" && l.amount > 0 && l.assignment) invoiceByRef.set(l.assignment, l);

  const out: Candidate[] = [];
  // receipts the customer has already paid that we have not yet applied: the invoices still show open in our books
  for (const r of i.unappliedReceipts ?? []) {
    out.push({
      item: {
        id: "", side: "books", amount: r.invoiceTotal, date: r.date, reference: r.utr, lineKey: r.key,
        narration: `Receipt of ${fmtINR(r.amount)} dated ${fmtDate(r.date)} sits in incoming payments clearing; the customer has settled ${r.invoiceRefs.join(", ")}`,
        suggestedClass: "receipt-unapplied", confidence: r.confidence, origin: "agent",
      },
    });
  }
  for (const l of open) {
    if (l.amount <= 0) continue;
    if (l.gl === "140100" && l.docType === "DR" && daysBetween(l.postingDate, i.asOf) <= recent) {
      out.push({
        item: {
          id: "", side: "books", amount: l.amount, date: l.postingDate, reference: l.assignment ?? l.reference, lineKey: l.key,
          narration: `Invoice ${l.assignment ?? l.reference ?? l.docNo} dated ${fmtDate(l.postingDate)} not yet booked by the customer`,
          suggestedClass: "invoice-not-booked", confidence: 0.96, origin: "agent",
        },
      });
    } else if (l.gl === "142100") {
      out.push({
        item: {
          id: "", side: "books", amount: l.amount, date: l.postingDate, reference: l.assignment, lineKey: l.key,
          narration: `Retention held on ${l.assignment ?? "the project"}, carried separately by the customer`,
          suggestedClass: "retention-separate", confidence: 0.9, origin: "agent",
        },
      });
    } else if (l.gl === "140100" && /residual/i.test(l.text ?? "")) {
      const invoice = l.assignment ? invoiceByRef.get(l.assignment) : undefined;
      const taxable = invoice ? invoice.amount / GST_FACTOR : l.amount / 0.02;
      const rate = TDS_RATES.find((r) => Math.abs(l.amount - Math.round(taxable * r)) <= 10);
      out.push({
        item: rate
          ? {
              id: "", side: "books", amount: l.amount, date: l.postingDate, reference: l.assignment, lineKey: l.key,
              narration: `Tax deducted at ${(rate * 100).toString().replace(/\.0+$/, "")}% on taxable value ${fmtINR(Math.round(taxable))}, not yet recognised`,
              suggestedClass: "tds-not-recognised", confidence: 0.92, origin: "agent",
            }
          : {
              id: "", side: "books", amount: l.amount, date: l.postingDate, reference: l.assignment, lineKey: l.key,
              narration: `Short payment of ${fmtINR(l.amount)} not explained by tax; the customer deducted it, we dispute it`,
              suggestedClass: "disputed-deduction", confidence: 0.68, origin: "agent",
            },
      });
    }
  }
  return out;
}

/** Find the smallest set of candidates whose amounts sum to the difference. */
export function diagnoseCustomer(i: DiagnoseInput): Diagnosis {
  const difference = i.booksBalance - i.replyBalance;
  if (difference === 0) return { items: [], difference, exact: true };
  const cands = candidates(i).slice(0, 14);
  let best: Candidate[] | undefined;
  for (let mask = 1; mask < 1 << cands.length; mask += 1) {
    let sum = 0;
    let size = 0;
    for (let k = 0; k < cands.length; k += 1) {
      if (mask & (1 << k)) {
        sum += cands[k].item.amount;
        size += 1;
      }
    }
    if (sum === difference && (!best || size < best.length)) best = cands.filter((_, k) => mask & (1 << k));
  }
  if (!best) return { items: [], difference, exact: false };
  return { items: best.map((c, n) => ({ ...c.item, id: `A${n + 1}` })), difference, exact: true };
}
