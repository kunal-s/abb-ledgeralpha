// The statutory auditor's request list for the quarterly limited review (demo
// workspace data). A request that depends on work in the platform carries a
// link, so its progress is computed from sign-offs rather than typed in.

import type { PbcRequest } from "@/types";

const r = (
  id: string,
  title: string,
  area: string,
  requestedOn: string,
  due: string,
  ownerId: string,
  seedStatus: PbcRequest["seedStatus"],
  extra: Partial<Pick<PbcRequest, "link" | "seedEvidence">> = {}
): PbcRequest => ({ id, title, area, requestedOn, due, ownerId, seedStatus, ...extra });

export const PBC_REQUESTS: PbcRequest[] = [
  // financial statements
  r("PBC-001", "Trial balance at 30-Sep-2026 with comparatives", "Financial statements", "2026-09-29", "2026-10-09", "P10", "provided", { seedEvidence: "Data load 01-Oct-2026, all load checks passed" }),
  r("PBC-002", "Auditor schedules for balance sheet accounts", "Financial statements", "2026-09-29", "2026-10-16", "P01", "in-preparation", { link: { kind: "accounts", categories: ["trade-recv", "trade-pay", "grir", "vendor-adv", "customer-adv", "unbilled", "retention", "tds-recv", "suspense", "deposits", "statutory-dues", "employee-adv", "gst", "other-payables", "intercompany", "prepaid"] } }),
  r("PBC-003", "Management representation letter, draft", "Financial statements", "2026-10-01", "2026-10-15", "P14", "open"),
  // fixed assets and inventory
  r("PBC-004", "Fixed asset register and depreciation roll-forward", "Fixed assets and inventory", "2026-09-29", "2026-10-12", "P03", "in-preparation", { link: { kind: "accounts", categories: ["fixed-assets"] } }),
  r("PBC-005", "Capital work in progress ageing and capitalisation list", "Fixed assets and inventory", "2026-09-29", "2026-10-12", "P03", "in-preparation", { link: { kind: "accounts", categories: ["cwip"] } }),
  r("PBC-006", "Inventory valuation and provision for slow-moving stock", "Fixed assets and inventory", "2026-09-30", "2026-10-13", "P02", "open", { link: { kind: "accounts", categories: ["inventory"] } }),
  // receivables
  r("PBC-007", "Trade receivables ageing with customer-wise balances", "Receivables", "2026-09-29", "2026-10-12", "P06", "in-preparation", { link: { kind: "accounts", categories: ["trade-recv"] } }),
  r("PBC-008", "Customer balance confirmations above ₹25 lakh", "Receivables", "2026-09-30", "2026-10-16", "P06", "in-preparation", { link: { kind: "recs", types: ["Customer statement"] } }),
  r("PBC-009", "Retention and unbilled revenue support by project", "Receivables", "2026-09-30", "2026-10-14", "P07", "in-preparation", { link: { kind: "accounts", categories: ["retention", "unbilled"] } }),
  r("PBC-010", "Customer advances and contract liabilities", "Receivables", "2026-09-30", "2026-10-14", "P07", "open", { link: { kind: "accounts", categories: ["customer-adv"] } }),
  // payables
  r("PBC-011", "Trade payables ageing and MSME dues", "Payables", "2026-09-29", "2026-10-06", "P02", "in-preparation", { link: { kind: "accounts", categories: ["trade-pay"] } }),
  r("PBC-012", "Vendor statement reconciliations, largest vendors", "Payables", "2026-09-30", "2026-10-16", "P02", "in-preparation", { link: { kind: "recs", types: ["Vendor statement"] } }),
  r("PBC-013", "Goods received not invoiced and GR/IR clearing", "Payables", "2026-09-30", "2026-10-13", "P02", "open", { link: { kind: "accounts", categories: ["grir"] } }),
  r("PBC-014", "Advances to vendors with guarantee cover", "Payables", "2026-09-30", "2026-10-13", "P03", "open", { link: { kind: "accounts", categories: ["vendor-adv"] } }),
  // cash and treasury
  r("PBC-015", "Bank reconciliations at 30-Sep-2026, all accounts", "Cash and treasury", "2026-09-29", "2026-10-09", "P08", "in-preparation", { link: { kind: "recs", types: ["Bank"] } }),
  r("PBC-016", "Bank confirmations and the guarantee register", "Cash and treasury", "2026-09-29", "2026-10-09", "P08", "provided", { seedEvidence: "Confirmation letters filed under TR-2026-Q3" }),
  r("PBC-017", "Foreign currency balances and revaluation workings", "Cash and treasury", "2026-09-30", "2026-10-06", "P08", "open"),
  // tax
  r("PBC-018", "TDS receivable reconciled to Form 26AS", "Tax", "2026-09-30", "2026-10-14", "P09", "in-preparation", { link: { kind: "accounts", categories: ["tds-recv"] } }),
  r("PBC-019", "TDS and statutory dues deposited and returns filed", "Tax", "2026-09-30", "2026-10-12", "P09", "in-preparation", { link: { kind: "accounts", categories: ["statutory-dues"] } }),
  r("PBC-020", "GST reconciliation of books to returns", "Tax", "2026-09-30", "2026-10-15", "P09", "open"),
  r("PBC-021", "Income-tax provision workings", "Tax", "2026-10-01", "2026-10-15", "P09", "open"),
  // provisions and group
  r("PBC-022", "Provisions roll-forward: warranty, liquidated damages, onerous contracts", "Provisions and group", "2026-09-30", "2026-10-13", "P04", "in-preparation", { link: { kind: "accounts", categories: ["provisions"] } }),
  r("PBC-023", "Actuarial valuation of gratuity and leave encashment", "Provisions and group", "2026-10-01", "2026-10-15", "P04", "open"),
  r("PBC-024", "Intercompany confirmations and related-party transactions", "Provisions and group", "2026-09-30", "2026-10-14", "P04", "in-preparation", { link: { kind: "recs", types: ["Intercompany"] } }),
  r("PBC-025", "Contingent liabilities and litigation summary", "Provisions and group", "2026-10-01", "2026-10-16", "P04", "open"),
  // journals and controls
  r("PBC-026", "Manual journals of the quarter, with the journals flagged and their review", "Journals and controls", "2026-09-29", "2026-10-12", "P01", "in-preparation", { link: { kind: "journals" } }),
  r("PBC-027", "Review controls: evidence of account and reconciliation sign-offs", "Journals and controls", "2026-10-01", "2026-10-16", "P11", "open"),
];

/** The auditor who raised the requests (a person of the demo roster). */
export const PBC_AUDITOR_ID = "P12";
