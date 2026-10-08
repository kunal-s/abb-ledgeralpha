// Story threads for the demo workspace (docs/FRD.md §9.3): the paths a
// presenter walks through, each step a screen, a role and, where it helps, an
// item to open. Records are reached through the generator's anchors, never by
// a hard-coded line key, so a change in the data cannot break a thread.

import type { RoleId } from "@/types";
import { LINE_BY_KEY, WORLD } from "@/data";

export interface StoryStep {
  title: string;
  /** one line, what to look at or do */
  hint: string;
  to: string;
  /** the role to act as from this step; the thread's role when absent */
  role?: RoleId;
  /** a ledger line to open in the item drawer */
  item?: string;
}

export interface StoryThread {
  id: string;
  title: string;
  /** one line for the menu */
  summary: string;
  role: RoleId;
  steps: StoryStep[];
}

const anchor = (id: string, i = 0): string => WORLD.anchors[id]?.[i] ?? "";
const glOf = (key: string) => LINE_BY_KEY.get(key)?.gl ?? "";
const customerRec = (key: string) => {
  const id = LINE_BY_KEY.get(key)?.partner?.id;
  return WORLD.reconciliations.find((r) => r.type === "Customer statement" && r.partyId === id)?.id ?? "";
};

export function buildThreads(): StoryThread[] {
  const advance = anchor("S-04");
  const noGuarantee = anchor("S-05");
  const rtgs = anchor("S-11");
  const statementLine = anchor("S-18");

  const threads: StoryThread[] = [
    {
      id: "stale-advance",
      title: "The stale vendor advance",
      summary: "Balance sheet review to a provision, approval and the auditor schedule",
      role: "controller",
      steps: [
        { title: "Where the risk sits", hint: "Seven areas take most of the manual effort; vendor advances is one of them", to: "/balance-sheet-review" },
        { title: "Vendor advances, oldest first", hint: "Every flagged item carries the rule that flagged it and what is recommended", to: "/balance-sheet-review?tab=exceptions&category=vendor-adv&show=all" },
        { title: "A 438 day advance", hint: "No purchase order activity, vendor blocked, and a guarantee is held", to: `/balance-sheet-review/${glOf(advance)}`, item: advance },
        { title: "The guarantee behind it", hint: "The advance payment guarantee expires on 31-Dec-2026", to: "/bank-guarantees" },
        { title: "An advance with no guarantee", hint: "Propose a provision as the account owner; the justification is recorded with the decision", to: `/balance-sheet-review/${glOf(noGuarantee)}`, item: noGuarantee, role: "gl-accountant" },
        { title: "Approve the provision", hint: "A different person approves; it then appears as a journal proposal", to: "/journals?tab=proposed", role: "controller" },
        { title: "In the auditor schedule", hint: "The schedule for the account reflects the decision", to: `/audit-readiness?tab=schedules&sched=${glOf(advance)}` },
      ],
    },
    {
      id: "gl-reconciliation",
      title: "GL account reconciliation",
      summary: "From the difference to the unexplained, for each kind of reconciliation",
      role: "gl-accountant",
      steps: [
        { title: "Difference by type", hint: "In rupees: what is explained and what is still open", to: "/reconciliations" },
        { title: "Control account against the sub-ledger", hint: "Manual postings with no business partner explain the difference", to: "/reconciliations/REC-SUB-140100" },
        { title: "Bank", hint: "Deposits in transit, unpresented payments, and one unidentified receipt", to: "/reconciliations/REC-BNK-181100" },
        { title: "GR/IR clearing", hint: "Closed orders are carried separately; the action is taken in the review", to: "/reconciliations/REC-GRI-211300" },
        { title: "A customer statement", hint: "The reply is in; apply it and the reconciler finds the four items", to: `/reconciliations/${customerRec(statementLine)}`, role: "ar-specialist" },
        { title: "Sign off as reviewer", hint: "Sign-off is blocked while anything is unexplained or undocumented", to: "/reconciliations?tab=register", role: "controller" },
      ],
    },
    {
      id: "unapplied-receipt",
      title: "The unapplied receipt",
      summary: "A receipt in clearing, matched with tax and bank charges, to the statement",
      role: "ar-specialist",
      steps: [
        { title: "Flagged in the review", hint: "A receipt has sat in incoming payments clearing for 211 days", to: "/balance-sheet-review?tab=exceptions&category=suspense&show=all", item: rtgs },
        { title: "Matched to two invoices", hint: "Withholding tax and a bank charge are inferred; the arithmetic is shown line by line", to: `/cash-application/${rtgs}` },
        { title: "The credit to expect", hint: "The deduction should appear in the tax statement; check", to: "/tax/withholding?tab=expected" },
        { title: "The customer statement", hint: "The difference moves from unexplained to explained once the receipt is applied", to: `/reconciliations/${customerRec(statementLine)}` },
        { title: "Working capital", hint: "Receivable days and unapplied cash, by business unit", to: "/reporting/working-capital" },
      ],
    },
    {
      id: "configure-rule",
      title: "Configure a rule",
      summary: "Describe a rule in words, test it on the ledger, add it",
      role: "controller",
      steps: [
        { title: "The rules in force", hint: "Each rule has its condition, thresholds and the items it flags", to: "/rules?rtab=rules&rule=BSR-05" },
        { title: "Describe a new rule", hint: "Pick an example or type one; it becomes conditions you can tune", to: "/rules?rtab=studio" },
        { title: "Backtest and add", hint: "See what it would flag on the real ledger before adding it", to: "/rules?rtab=studio" },
        { title: "See it at work", hint: "The new rule's findings appear in the review like any other", to: "/balance-sheet-review?tab=exceptions" },
      ],
    },
    {
      id: "quarter-close",
      title: "Quarter close",
      summary: "The close plan, sign-offs, statements and auditor requests",
      role: "controller",
      steps: [
        { title: "The close plan", hint: "Tasks complete from the work itself: sign-offs and reconciliations", to: "/close" },
        { title: "Account sign-offs", hint: "Preparer, then a different reviewer", to: "/balance-sheet-review?tab=accounts" },
        { title: "The statements", hint: "From the same ledger, with the statutory ageing note", to: "/reporting/financial-statements" },
        { title: "Auditor requests", hint: "Answered from the schedules and sign-offs", to: "/audit-readiness?tab=requests" },
      ],
    },
    {
      id: "what-moved",
      title: "What moved",
      summary: "Variance bridge to the transactions behind it",
      role: "reporting-analyst",
      steps: [
        { title: "The variance bridge", hint: "Components add up exactly to the movement", to: "/reporting/variance" },
        { title: "By business unit and project", hint: "Margin and estimate at completion", to: "/reporting/management" },
      ],
    },
    {
      id: "governance",
      title: "Governance",
      summary: "Every step logged; agents propose, people decide",
      role: "controls-lead",
      steps: [
        { title: "Activity log", hint: "Every action, who took it, and why", to: "/activity" },
        { title: "Agents", hint: "Proposals and overrides, computed from the decisions", to: "/agents" },
        { title: "Controls", hint: "Review evidence collected from the work, and blocked self-approvals", to: "/controls" },
      ],
    },
  ];
  // a step whose record is not in the data is left out rather than leading nowhere
  const reachable = (s: StoryStep) => !s.to.endsWith("/") && !s.to.includes("//") && (s.item === undefined || s.item !== "");
  return threads.map((t) => ({ ...t, steps: t.steps.filter(reachable) }));
}
