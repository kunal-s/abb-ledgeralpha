// The close plan of the demo workspace: phases and tasks in working days from
// the period end, who owns each and what it follows. A task that depends on work
// in the platform carries a link, so its status is derived from the record
// (docs/FRD.md FR-CLS-01); the rest are completed by their owner with a reference.

import type { CloseTaskDef, CloseTaskWork, ClosePhaseDef } from "@/types";
import { TENANT } from "@/config/tenant";
import { dateOfWd } from "@/lib/workdays";

/** Working day by which the whole close is planned to be signed off. */
export const CLOSE_TARGET_WD = { month: 7, quarter: 8 } as const;

/** The last working day the seeded history covers: the work and the orchestrator's runs before the session starts. */
export const SEEDED_UNTIL_WD = 2;

/** The window the calendar draws. */
export const CLOSE_WD_RANGE = { min: -2, max: 8 } as const;

export const CLOSE_PHASES: ClosePhaseDef[] = [
  { id: "A", name: "Pre-close" },
  { id: "B", name: "Postings and accruals" },
  { id: "C", name: "Reconciliations" },
  { id: "D", name: "Balance sheet review" },
  { id: "E", name: "Journals and approvals" },
  { id: "F", name: "Tax" },
  { id: "G", name: "Reporting" },
  { id: "Q", name: "Quarter-end", quarterOnly: true },
];

const t = (
  id: string,
  phase: string,
  name: string,
  ownerId: string,
  startWd: number,
  dueWd: number,
  after: string[],
  link: CloseTaskDef["link"] = { kind: "manual" }
): CloseTaskDef => ({ id, phase, name, ownerId, startWd, dueWd, after, link });

export const CLOSE_TASKS: CloseTaskDef[] = [
  // A: pre-close
  t("A1", "A", "Send the cut-off notice and freeze sub-ledger postings", "P01", -2, -1, []),
  t("A2", "A", "Confirm goods received and purchase order cut-off", "P02", -1, 0, ["A1"]),

  // B: postings and accruals
  t("B1", "B", "Payroll and statutory deposits posted", "P05", 0, 1, ["A1"], { kind: "postings", docType: "PR" }),
  t("B2", "B", "Depreciation run", "P03", 0, 1, ["A1"], { kind: "postings", docType: "AF" }),
  t("B3", "B", "Month-end accruals posted", "P02", 0, 1, ["A2"], { kind: "accruals-posted" }),
  t("B4", "B", "Provisions updated: warranty, gratuity and leave encashment", "P04", 0, 2, ["B3"]),
  t("B5", "B", "Foreign currency balances revalued", "P08", 0, 2, ["A1"]),

  // C: reconciliations
  t("C1", "C", "Receipts in clearing applied or parked", "P06", 1, 4, ["B1"], { kind: "receipts-handled" }),
  t("C2", "C", "Bank reconciliations signed off", "P08", 1, 3, ["B1", "B2"], { kind: "recs", types: ["Bank"] }),
  t("C3", "C", "Sub-ledger, GR/IR, schedule and tax account reconciliations signed off", "P01", 2, 4, ["B1", "B2", "B3"], { kind: "recs", types: ["Sub-ledger", "GR/IR", "Schedule-supported", "Tax account"] }),
  t("C4", "C", "Customer statement reconciliations signed off", "P06", 2, 5, ["C1"], { kind: "recs", types: ["Customer statement"] }),
  t("C5", "C", "Vendor statement reconciliations signed off", "P02", 2, 5, ["B3"], { kind: "recs", types: ["Vendor statement"] }),
  t("C6", "C", "Intercompany reconciliations signed off", "P04", 2, 5, ["B5"], { kind: "recs", types: ["Intercompany"] }),

  // D: balance sheet review
  t("D1", "D", "Fixed asset, capital work in progress and inventory accounts signed off", "P03", 2, 5, ["B2"], { kind: "accounts", categories: ["fixed-assets", "cwip", "inventory"] }),
  t("D2", "D", "Receivable, unbilled revenue and retention accounts signed off", "P07", 3, 6, ["C4"], { kind: "accounts", categories: ["trade-recv", "unbilled", "retention"] }),
  t("D3", "D", "Payable, GR/IR and advance accounts signed off", "P02", 3, 6, ["C5"], { kind: "accounts", categories: ["trade-pay", "grir", "vendor-adv", "customer-adv"] }),
  t("D4", "D", "Tax and statutory dues accounts signed off", "P09", 3, 6, ["C3"], { kind: "accounts", categories: ["tds-recv", "gst", "statutory-dues"] }),
  t("D5", "D", "Provision and accrual accounts signed off", "P04", 3, 6, ["B4"], { kind: "accounts", categories: ["provisions"] }),
  t("D6", "D", "Suspense, deposit, cash, group and equity accounts signed off", "P05", 3, 6, ["C2", "C6"], { kind: "accounts", categories: ["suspense", "deposits", "employee-adv", "other-payables", "prepaid", "intercompany", "bank", "equity"] }),
  t("D7", "D", "Flagged items above the documentation threshold documented", "P01", 3, 6, ["C3"], { kind: "flagged-documented" }),

  // E: journals and approvals
  t("E1", "E", "Flagged journals reviewed", "P01", 2, 5, ["B4"], { kind: "journals-reviewed" }),
  t("E2", "E", "Journal proposals approved and exported", "P01", 4, 6, ["D7", "E1"], { kind: "proposals-exported" }),

  // F: tax
  t("F1", "F", "Withholding tax credits checked against the credit statement", "P09", 2, 5, ["C4"]),
  t("F2", "F", "Indirect tax returns reconciled to the books", "P09", 3, 6, ["B1"]),
  t("F3", "F", "Income tax provision computed", "P09", 5, 7, ["D4"]),

  // G: reporting
  t("G1", "G", "Flux commentary drafted", "P10", 5, 6, ["D7"]),
  t("G2", "G", "Financial statements drafted", "P10", 6, 7, ["D1", "D2", "D3", "D4", "D5", "D6", "F3", "G1"]),
  t("G3", "G", "Results reviewed by management", "P13", 7, 7, ["G2", "E2"]),

  // Q: quarter-end only
  t("Q1", "Q", "Auditor schedules ready", "P01", 4, 7, ["D1", "D2", "D3", "D4", "D5", "D6"], { kind: "pbc", ids: ["PBC-002"] }),
  t("Q2", "Q", "Auditor requests provided", "P01", 5, 8, ["Q1"], { kind: "pbc" }),
  t("Q3", "Q", "Limited review procedures completed", "P01", 6, 8, ["Q2"]),
  t("Q4", "Q", "Results approved for the board", "P14", 8, 8, ["Q3", "G3"]),
];

const at = (wd: number, hhmm: string) => `${dateOfWd(TENANT.currentPeriodEnd, wd)}T${hhmm}`;

/** The tasks done by hand before the demo session starts. */
export const SEEDED_CLOSE_WORK: Record<string, CloseTaskWork> = {
  A1: { completed: { personId: "P01", at: at(-2, "17:10"), evidence: "Cut-off notice CN-2026-09" } },
  A2: { completed: { personId: "P02", at: at(0, "18:20"), evidence: "Goods receipt cut-off list GRC-0930" } },
  B4: { completed: { personId: "P04", at: at(1, "16:40"), evidence: "Provision workings PRV-0930" } },
  B5: { completed: { personId: "P08", at: at(2, "11:15"), evidence: "Revaluation run FX-0930" } },
};
