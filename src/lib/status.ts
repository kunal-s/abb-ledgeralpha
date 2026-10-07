// Central status -> {label, tone} map. Keys match the status unions in
// src/types (ItemStatus, AccountReviewStatus). Modules add their statuses here;
// the status chip draws them and exports use the same words.

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

export const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  // Item lifecycle (docs/FRD.md §4.4)
  "within-policy": { label: "Within policy", tone: "ok" },
  flagged: { label: "Flagged", tone: "danger" },
  "in-follow-up": { label: "In follow-up", tone: "warn" },
  "decision-proposed": { label: "Decision proposed", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "danger" },
  exported: { label: "Exported", tone: "info" },
  "closed-in-erp": { label: "Closed in ERP", tone: "ok" },
  // Account sign-off lifecycle (docs/FRD.md §4.4)
  "not-started": { label: "Not started", tone: "neutral" },
  "in-review": { label: "In review", tone: "info" },
  "ready-for-signoff": { label: "Ready for sign-off", tone: "warn" },
  "preparer-signed": { label: "Preparer signed", tone: "info" },
  "reviewer-signed": { label: "Signed off", tone: "ok" },
  reopened: { label: "Reopened", tone: "warn" },
  // Tax review
  cleared: { label: "Tax cleared", tone: "ok" },
  objected: { label: "Tax objection", tone: "danger" },
  // Cash application: receipts waiting in clearing (docs/FRD.md §6.8)
  ready: { label: "Ready to confirm", tone: "ok" },
  suggested: { label: "Match to review", tone: "info" },
  unmatched: { label: "No match", tone: "danger" },
  parked: { label: "Parked", tone: "neutral" },
  // Tax deposits (docs/FRD.md §6.12)
  deposited: { label: "Deposited", tone: "ok" },
  "deposited-late": { label: "Deposited late", tone: "warn" },
  due: { label: "Due", tone: "info" },
  overdue: { label: "Overdue", tone: "danger" },
  // Tax credit statement check (docs/FRD.md §6.12)
  matched: { label: "Matched", tone: "ok" },
  "wrong-tan": { label: "Wrong tax ID", tone: "info" },
  short: { label: "Short credit", tone: "warn" },
  "wrong-quarter": { label: "Wrong quarter", tone: "warn" },
  missing: { label: "Missing", tone: "danger" },
  pending: { label: "Statement pending", tone: "neutral" },
  // Counterparty confirmation (docs/FRD.md §6.7)
  "not-sent": { label: "Not sent", tone: "neutral" },
  sent: { label: "Awaiting reply", tone: "info" },
  "reply-received": { label: "Reply received", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "ok" },
  "counter-statement": { label: "Counter-statement", tone: "warn" },
  disputed: { label: "Disputed", tone: "danger" },
  // Journal review (docs/FRD.md §6.4)
  system: { label: "System posted", tone: "neutral" },
  accepted: { label: "Accepted", tone: "ok" },
  "support-requested": { label: "Support requested", tone: "warn" },
  // Auditor requests (docs/FRD.md §6.17)
  open: { label: "Open", tone: "neutral" },
  "in-preparation": { label: "In preparation", tone: "info" },
  provided: { label: "Provided", tone: "ok" },
  closed: { label: "Closed", tone: "neutral" },
};

/** The words a status is shown with, on screen and in exports. */
export const statusLabel = (status: string): string => STATUS_MAP[status]?.label ?? status;
