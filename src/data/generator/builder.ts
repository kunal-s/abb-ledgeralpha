// LedgerBuilder — posts balanced documents into the line-item store, the way
// an ERP would: every document's lines sum to zero, document numbers come from
// per-type, per-fiscal-year ranges, and clearing marks offsetting open items.
// Because every document balances, the trial balance ties by construction.

import type { DocType, IsoDate, LineItem, PartnerType } from "@/types";
import { fiscalYearOf } from "@/lib/dates";

export interface Leg {
  gl: string;
  amount: number;
  pc: string;
  partner?: { type: PartnerType; id: string };
  wbs?: string;
  po?: { number: string; item: number };
  assignment?: string;
  text?: string;
  docCurrency?: string;
  amountDoc?: number;
  dueDate?: IsoDate;
  costCentre?: string;
}

export interface DocHeader {
  docType: DocType;
  postingDate: IsoDate;
  documentDate?: IsoDate;
  entryDate?: IsoDate;
  entryTime?: string;
  enteredBy: string;
  reference?: string;
  text?: string;
  manual?: boolean;
}

/** Document-number range prefixes per document type (10-digit numbers). */
const RANGE_PREFIX: Record<string, string> = {
  SA: "10",
  AB: "20",
  PR: "30",
  WE: "50",
  KR: "51",
  RE: "52",
  AF: "60",
  DZ: "14",
  KZ: "15",
  ZP: "16",
  DR: "90",
};

export class LedgerBuilder {
  readonly lines: LineItem[] = [];
  private seq = new Map<string, number>();

  constructor(
    private readonly companyCode: string,
    private readonly fyStartMonth: number,
    private readonly erpGoLive: IsoDate,
    private readonly sourceNames: { erp: string; legacy: string }
  ) {}

  private nextDocNo(docType: string, fiscalYear: number): string {
    const prefix = RANGE_PREFIX[docType] ?? "19";
    const k = `${prefix}-${fiscalYear}`;
    const n = (this.seq.get(k) ?? 0) + 1;
    this.seq.set(k, n);
    return `${prefix}${String(n).padStart(8, "0")}`;
  }

  /** Post a document. Throws if the legs do not balance — a bug, never data. */
  post(h: DocHeader, legs: Leg[]): LineItem[] {
    const sum = legs.reduce((s, l) => s + l.amount, 0);
    if (sum !== 0) {
      throw new Error(`Unbalanced document (${h.docType} ${h.postingDate}): ${sum}`);
    }
    const fiscalYear = fiscalYearOf(h.postingDate, this.fyStartMonth);
    const docNo = this.nextDocNo(h.docType, fiscalYear);
    const sourceSystem = h.postingDate < this.erpGoLive ? this.sourceNames.legacy : this.sourceNames.erp;
    const created = legs
      .filter((l) => l.amount !== 0)
      .map((l, i): LineItem => ({
        key: `${this.companyCode}-${fiscalYear}-${docNo}-${i + 1}`,
        companyCode: this.companyCode,
        gl: l.gl,
        fiscalYear,
        docNo,
        lineItem: i + 1,
        docType: h.docType,
        postingKey: postingKeyFor(h.docType, l),
        postingDate: h.postingDate,
        documentDate: h.documentDate ?? h.postingDate,
        dueDate: l.dueDate,
        entryDate: h.entryDate ?? h.postingDate,
        entryTime: h.entryTime,
        enteredBy: h.enteredBy,
        amount: l.amount,
        docCurrency: l.docCurrency ?? "INR",
        amountDoc: l.amountDoc ?? l.amount,
        assignment: l.assignment,
        reference: h.reference,
        text: l.text ?? h.text,
        profitCentre: l.pc,
        wbs: l.wbs,
        costCentre: l.costCentre,
        partner: l.partner,
        po: l.po,
        sourceSystem,
        manual: h.manual ?? false,
      }));
    this.lines.push(...created);
    return created;
  }

  /** Clear open items against each other. They must net to zero per GL. */
  clear(items: LineItem[], clearingDocNo: string, clearingDate: IsoDate): void {
    const byGl = new Map<string, number>();
    for (const i of items) byGl.set(i.gl, (byGl.get(i.gl) ?? 0) + i.amount);
    for (const [gl, net] of byGl) {
      if (net !== 0) throw new Error(`Clearing on ${gl} does not net to zero: ${net}`);
    }
    for (const i of items) i.clearing = { docNo: clearingDocNo, date: clearingDate };
  }
}

/** SAP posting keys: 40/50 G/L, 01/11/15 customer, 21/25/31 vendor, 29/39 special G/L. */
function postingKeyFor(docType: DocType, l: Leg): string {
  const debit = l.amount > 0;
  if (l.partner?.type === "Customer") return debit ? "01" : docType === "DZ" ? "15" : "11";
  if (l.partner?.type === "Vendor" || l.partner?.type === "Group company") {
    return debit ? (docType === "KZ" ? "29" : "21") : docType === "KZ" ? "39" : "31";
  }
  return debit ? "40" : "50";
}
