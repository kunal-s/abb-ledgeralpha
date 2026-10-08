// Policy defaults - ageing, materiality and delegation of authority.
// Product defaults; a workspace overrides them in Settings (docs/FRD.md §4.4).

import type { RoleId } from "@/types";

/** Review ageing (operational), distinct from Schedule III disclosure ageing. */
export const AGEING_POLICY = {
  basis: "postingDate" as "postingDate" | "documentDate" | "dueDate",
  buckets: [
    { id: "0-90", label: "0–90 days", min: 0, max: 90 },
    { id: "91-180", label: "91–180 days", min: 91, max: 180 },
    { id: "181-365", label: "181–365 days", min: 181, max: 365 },
    { id: "365+", label: "Over 365 days", min: 366, max: null },
  ],
  reviewThresholdDays: 180,
} as const;

/**
 * Reconciliation policy. A reconciliation cannot be signed off while its
 * unexplained difference is outside the tolerance for its type. Reconciling
 * items older than `agedItemDays` are flagged as aged.
 */
export const RECON_POLICY = {
  tolerance: {
    Bank: 100,
    "Sub-ledger": 0,
    "GR/IR": 0,
    "Schedule-supported": 1_000,
    "Tax account": 100,
    Intercompany: 1_000,
    "Customer statement": 1_000,
    "Vendor statement": 1_000,
  },
  agedItemDays: 30,
} as const;

/**
 * Cash application policy. The matcher explains the gap between open invoices
 * and a receipt only with these deductions; anything else is left as a residual.
 */
export const CASH_APP_POLICY = {
  /** a difference up to this (and up to the percentage of the invoices) is written to bank charges */
  smallDifferenceMax: 15_000,
  smallDifferencePct: 0.005,
  /** agreement to the rupee */
  exactTolerance: 10,
  /** withholding rates tested on the taxable value (excluding GST) */
  tdsRates: [0.001, 0.01, 0.02, 0.05, 0.1],
  /** GST TDS on government and PSU customers, on the taxable value */
  gstTdsRate: 0.02,
  /** bank charges including GST that banks levy as fixed amounts */
  standardBankCharges: [590, 1_180, 2_360, 4_720],
  /** most invoices combined in one application, and how many of a customer's open invoices (nearest the receipt date) are searched */
  maxInvoices: 4,
  poolSize: 60,
  /** matches at or above this confidence can be confirmed in bulk */
  bulkConfirmFrom: 0.9,
  /** below this the matcher proposes nothing and the receipt needs a remittance advice */
  proposeFrom: 0.6,
} as const;

/**
 * Journal review policy: what the journal reviewer flags on manual journals.
 * Hours are the hour of entry (24-hour clock).
 */
export const JOURNAL_REVIEW_POLICY = {
  round: { minAmount: 1_00_000, roundTo: 1_00_000 },
  afterHours: { lateHour: 22, earlyHour: 6 },
  /** an account pair used this few times in the whole ledger is unusual, above this amount */
  unusualPair: { maxSeen: 2, minAmount: 5_00_000 },
  dormantDays: 180,
} as const;

/** Items at or above this need a written justification before a decision is proposed. */
export const MATERIALITY_POLICY = {
  documentedActionAmount: 1_00_000,
} as const;

/**
 * Delegation of authority. The preparer proposes; the chain approves in order.
 * Write-backs and tax write-offs add the tax specialist at any band.
 */
export const APPROVAL_BANDS = [
  { id: "B1", upTo: 5_00_000, chain: ["controller"] },
  { id: "B2", upTo: 50_00_000, chain: ["controller", "head-of-finance"] },
  { id: "B3", upTo: null, chain: ["controller", "head-of-finance", "cfo"] },
] as const satisfies readonly { id: string; upTo: number | null; chain: readonly RoleId[] }[];

export type ApprovalBandId = (typeof APPROVAL_BANDS)[number]["id"];

export function bandFor(amount: number): (typeof APPROVAL_BANDS)[number] {
  const abs = Math.abs(amount);
  return APPROVAL_BANDS.find((b) => b.upTo === null || abs <= b.upTo)!;
}

/**
 * What the balance sheet is compared with. Schedule III compares with the previous year end; an interim
 * statement is more useful against the previous quarter end, and in the demo dataset balances from before the
 * last quarter hold only the items still open today, so the quarter end is the comparison that means something.
 */
export const STATEMENT_POLICY = { balanceSheetComparative: "previous-quarter-end" as "previous-quarter-end" | "previous-year-end" };

/** An escalation is decided one level above the band its amount falls in (never below the first). */
export function escalatedBandFor(amount: number): (typeof APPROVAL_BANDS)[number] {
  const i = APPROVAL_BANDS.findIndex((b) => b.id === bandFor(amount).id);
  return APPROVAL_BANDS[Math.min(i + 1, APPROVAL_BANDS.length - 1)];
}

/** An item with no specific finding is recommended for escalation when it is this large and this old. */
export const ESCALATION_POLICY = { minAmount: 50_00_000, minAgeDays: 365 };

/** Actions that always need tax review, whatever the band. */
export const TAX_REVIEW_POLICY = ["Write back", "Write off of tax receivables"] as const;

/** How approved journals leave the platform. */
export const WRITE_BACK_POLICY = {
  mode: "proposal-file" as "proposal-file" | "governed-posting",
  label: "Proposal file for posting in the ERP",
};
