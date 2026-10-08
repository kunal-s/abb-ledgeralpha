// The control register of the demo workspace (docs/FRD.md §6.18): each control
// is mapped to a record-to-report process and tested from what the platform
// records. The test lives in `src/engine/controls.ts`; a workspace changes its
// register here without touching the engine.

export type ControlProcess = "Close" | "Balance sheet review" | "Reconciliation" | "Journals" | "Approvals" | "Rules and data";

export interface ControlDef {
  id: string;
  name: string;
  process: ControlProcess;
  /** the risk it answers, in a line */
  risk: string;
  owner: string;
  frequency: "Each close" | "Continuous";
  /** which test the engine runs */
  test: "review-four-eyes" | "review-deadline" | "bank-rec-due" | "rec-tolerance" | "delegation" | "tax-review" | "journal-four-eyes" | "journal-concluded" | "rule-reason";
}

export const CONTROL_REGISTER: ControlDef[] = [
  { id: "ICFR-01", name: "Account and reconciliation reviews are signed by a different person than the preparer", process: "Balance sheet review", risk: "A preparer reviews their own work", owner: "Financial Controller", frequency: "Each close", test: "review-four-eyes" },
  { id: "ICFR-02", name: "Balance sheet accounts are signed off by the reviewer within 15 days of the period end", process: "Balance sheet review", risk: "Balances reach the statements without review", owner: "Financial Controller", frequency: "Each close", test: "review-deadline" },
  { id: "ICFR-03", name: "Bank reconciliations are certified by their due date", process: "Reconciliation", risk: "Cash differences go unnoticed", owner: "Treasury Analyst", frequency: "Each close", test: "bank-rec-due" },
  { id: "ICFR-04", name: "A reconciliation is signed only when what is unexplained is within tolerance", process: "Reconciliation", risk: "Unexplained differences are certified", owner: "Financial Controller", frequency: "Continuous", test: "rec-tolerance" },
  { id: "ICFR-05", name: "Decisions are approved in the order of the delegation band, never by their proposer", process: "Approvals", risk: "Authority is exceeded or self-approved", owner: "Head of Finance", frequency: "Continuous", test: "delegation" },
  { id: "ICFR-06", name: "Write-backs and tax write-offs are cleared by tax review before approval", process: "Approvals", risk: "Tax effects are missed", owner: "Tax Specialist", frequency: "Continuous", test: "tax-review" },
  { id: "ICFR-07", name: "A flagged journal is reviewed by someone other than the person who entered it", process: "Journals", risk: "Override of controls through manual entries", owner: "Financial Controller", frequency: "Continuous", test: "journal-four-eyes" },
  { id: "ICFR-08", name: "Flagged journals are concluded within 7 days of the period end", process: "Journals", risk: "Unusual entries stay in the books unexamined", owner: "Financial Controller", frequency: "Each close", test: "journal-concluded" },
  { id: "ICFR-09", name: "Every change to a rule carries a reason", process: "Rules and data", risk: "Thresholds drift without explanation", owner: "Internal Controls Lead", frequency: "Continuous", test: "rule-reason" },
];
