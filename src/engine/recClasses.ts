// Reconciling-item taxonomy per reconciliation type (docs/FRD.md §6.7). The
// class says why the books and the source differ; its treatment says what has
// to happen next.

import type { ReconClass, ReconType } from "@/types";

const c = (id: string, label: string, treatment: ReconClass["treatment"], hint: string): ReconClass => ({ id, label, treatment, hint });

export const RECON_CLASSES: Record<ReconType, ReconClass[]> = {
  Bank: [
    c("deposit-in-transit", "Deposit in transit", "timing", "Receipt booked, not yet credited by the bank"),
    c("unpresented-payment", "Unpresented payment", "timing", "Payment booked, not yet debited by the bank"),
    c("bank-charges", "Bank charges not booked", "adjust-books", "Debited by the bank, no entry in the books"),
    c("bank-interest", "Interest not booked", "adjust-books", "Credited by the bank, no entry in the books"),
    c("unidentified-receipt", "Unidentified receipt", "adjust-books", "Credited by the bank, remitter unknown; park in clearing and match later"),
    c("bank-error", "Bank error", "adjust-source", "The bank has to correct its record"),
  ],
  "Sub-ledger": [
    c("direct-posting", "Posting direct to control account", "adjust-books", "Posted to the control account without a business partner"),
    c("subledger-timing", "Posting in transit between ledgers", "timing", "Will reach the sub-ledger in the next run"),
  ],
  "Schedule-supported": [
    c("journal-not-posted", "Schedule movement not yet journalised", "adjust-books", "The schedule moved; the journal has not been posted"),
    c("schedule-not-updated", "Posting not yet in the schedule", "adjust-source", "The books moved; the schedule has not been updated"),
    c("estimate-difference", "Estimate difference", "investigate", "Needs the owner's explanation"),
  ],
  "Tax account": [
    c("deposit-due", "Deducted, deposit due", "timing", "Liability of the month, deposit due next month"),
    c("challan-not-booked", "Challan paid, not booked", "adjust-books", "Deposited with the authority, no entry in the books"),
    c("tax-mismatch", "Mismatch with the return", "investigate", "Needs the tax team's explanation"),
  ],
  Intercompany: [
    c("ic-in-transit", "In transit", "timing", "Booked by one side, not yet by the other"),
    c("ic-fx", "FX revaluation difference", "adjust-books", "Foreign-currency balance not yet revalued at the closing rate"),
    c("ic-missing-booking", "Counterparty booking missing", "adjust-books", "The group company booked a charge we have not recorded"),
    c("ic-counterparty-error", "Counterparty error", "adjust-source", "The group company has to correct its record"),
  ],
  "Customer statement": [
    c("invoice-not-booked", "Invoice not yet booked by the customer", "timing", "Our invoice is recent; the customer has not booked it"),
    c("payment-in-transit", "Payment sent, not yet received", "timing", "The customer paid; the receipt has not reached us"),
    c("retention-separate", "Retention carried separately", "classification", "The customer holds retention in a separate payable; not a dispute"),
    c("receipt-unapplied", "Receipt received, not yet applied", "adjust-books", "The customer has paid; the receipt sits in incoming payments clearing until it is applied in Cash Application"),
    c("tds-not-recognised", "Tax deducted, not yet recognised", "adjust-books", "The customer deducted tax; the receipt left a residual on the invoice"),
    c("customer-error", "Customer error", "adjust-source", "The customer has to correct its record"),
    c("disputed-deduction", "Deduction disputed", "dispute", "A deduction (for example liquidated damages) we do not accept"),
  ],
  "Vendor statement": [
    c("vendor-invoice-not-booked", "Vendor invoice not booked", "adjust-books", "The vendor shows an invoice we have not recorded"),
    c("vendor-payment-in-transit", "Payment in transit", "timing", "We paid; the vendor has not yet received it"),
    c("credit-note-pending", "Credit note pending", "adjust-source", "The vendor has to issue the credit note"),
    c("vendor-dispute", "Disputed invoice", "dispute", "We dispute the invoice with the vendor"),
  ],
};

/** Reconciliation types in the order they are listed. */
export const RECON_TYPES = Object.keys(RECON_CLASSES) as ReconType[];

const BY_ID = new Map<string, ReconClass>();
for (const list of Object.values(RECON_CLASSES)) for (const k of list) BY_ID.set(k.id, k);

export const reconClass = (id: string | undefined): ReconClass | undefined => (id ? BY_ID.get(id) : undefined);

export const TREATMENT_LABELS: Record<ReconClass["treatment"], string> = {
  timing: "Timing",
  classification: "Classification",
  "adjust-books": "Adjust books",
  "adjust-source": "Source to correct",
  dispute: "Dispute",
  investigate: "Investigate",
};
