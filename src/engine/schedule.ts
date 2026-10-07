// Auditor schedules (docs/FRD.md Appendix D): one schedule per balance sheet
// account for the review period, assembled from the Balance Sheet Review and
// the Reconciliations so the figures are the same figures. This file defines the
// schedule and lays it out as workbook sheets; the assembly reads the states.

import type { AccountReviewStatus, IsoDate } from "@/types";
import type { Cell, Sheet } from "@/lib/xlsx";
import { fmtDate } from "@/lib/dates";
import { statusLabel } from "@/lib/status";

export interface ScheduleItem {
  key: string;
  docNo: string;
  date: IsoDate;
  party: string;
  text: string;
  amount: number;
  age: number;
  rules: string;
  /** what has been done: "Write back proposed", "Follow-up open" */
  status: string;
  /** decision, follow-up or reconciliation reference */
  support: string;
  comment: string;
}

export interface ScheduleDecision {
  id: string;
  item: string;
  action: string;
  amount: number;
  band: string;
  proposedBy: string;
  proposedAt: string;
  approvals: string;
  status: string;
}

export interface ScheduleRec {
  id: string;
  name: string;
  type: string;
  books: number;
  source: number | null;
  difference: number | null;
  unexplained: number | null;
  items: number;
  status: string;
}

export interface AccountSchedule {
  entity: string;
  gl: string;
  description: string;
  statementLine: string;
  category: string;
  period: IsoDate;
  priorDate: IsoDate;
  owner: string;
  reviewer: string;
  riskTier: string;
  rollForward: { opening: number; debits: number; credits: number; closing: number; trialBalance: number; ties: boolean };
  ageing: { label: string; count: number; amount: number }[];
  /** the statutory disclosure bands, for trade receivables and payables */
  statutory?: { label: string; count: number; amount: number }[];
  items: ScheduleItem[];
  decisions: ScheduleDecision[];
  recs: ScheduleRec[];
  commentary?: string;
  preparer?: string;
  reviewerSignOff?: string;
  status: AccountReviewStatus;
  readiness: "ready" | "in-progress" | "not-started";
  blockers: string[];
}

export function readinessOf(status: AccountReviewStatus): AccountSchedule["readiness"] {
  if (status === "reviewer-signed") return "ready";
  return status === "not-started" ? "not-started" : "in-progress";
}

const bold = (v: string | number, format?: "int" | "money"): Cell => ({ v, bold: true, format });
const money = (v: number | null): Cell => (v === null ? "-" : { v, format: "money" });
const int = (v: number): Cell => ({ v, format: "int" });
const dr = (v: number): Cell => ({ v, format: "money" });

/** One account's schedule as the rows of a worksheet: the seven parts of Appendix D, one under the other. */
export function scheduleRows(s: AccountSchedule): Cell[][] {
  const out: Cell[][] = [];
  const gap = () => out.push([]);
  const section = (title: string) => {
    gap();
    out.push([bold(title)]);
  };

  out.push([bold(`${s.entity} - ${s.gl} ${s.description}`)]);
  out.push(["Statement line", s.statementLine]);
  out.push(["Category", s.category]);
  out.push(["Period", `${fmtDate(s.priorDate)} to ${fmtDate(s.period)}`]);
  out.push(["Owner", s.owner]);
  out.push(["Reviewer", s.reviewer]);
  out.push(["Risk tier", s.riskTier]);

  section("Roll-forward (debits positive, credits negative)");
  out.push([bold("Opening"), bold("Debits"), bold("Credits"), bold("Closing"), bold("Per trial balance"), bold("Difference")]);
  const rf = s.rollForward;
  out.push([dr(rf.opening), dr(rf.debits), dr(rf.credits), dr(rf.closing), dr(rf.trialBalance), dr(rf.closing - rf.trialBalance)]);

  section("Ageing (review bands)");
  out.push([bold("Band"), bold("Items"), bold("Amount")]);
  for (const a of s.ageing) out.push([a.label, int(a.count), dr(a.amount)]);
  if (s.ageing.length === 0) out.push(["Not an open-item account, so there is no ageing"]);
  if (s.statutory) {
    section("Ageing (statutory disclosure bands)");
    out.push([bold("Band"), bold("Items"), bold("Amount")]);
    for (const a of s.statutory) out.push([a.label, int(a.count), dr(a.amount)]);
  }

  section(`Items above the review threshold or flagged (${s.items.length})`);
  out.push(["Document", "Date", "Party", "Text", "Amount", "Age (days)", "Rules", "Status", "Support", "Comment"].map((h) => bold(h)));
  for (const i of s.items) out.push([i.docNo, fmtDate(i.date), i.party, i.text, dr(i.amount), int(i.age), i.rules, i.status, i.support, i.comment]);

  section(`Decisions in the period (${s.decisions.length})`);
  out.push(["Decision", "Item", "Action", "Amount", "Band", "Proposed by", "Proposed on", "Approvals", "Status"].map((h) => bold(h)));
  for (const d of s.decisions) out.push([d.id, d.item, d.action, dr(d.amount), d.band, d.proposedBy, d.proposedAt, d.approvals, d.status]);

  if (s.recs.length) {
    section("Reconciliation summary");
    out.push(["Reconciliation", "Type", "Per books", "Per source", "Difference", "Unexplained", "Reconciling items", "Status"].map((h) => bold(h)));
    for (const r of s.recs) out.push([`${r.id} ${r.name}`, r.type, dr(r.books), money(r.source), money(r.difference), money(r.unexplained), int(r.items), statusLabel(r.status)]);
  }

  section("Commentary and sign-off");
  out.push([s.commentary ?? "No commentary saved"]);
  out.push(["Preparer", s.preparer ?? "Not signed"]);
  out.push(["Reviewer", s.reviewerSignOff ?? "Not signed"]);
  return out;
}

/** The workbook's first sheet: every account in one table. */
export function summaryRows(list: AccountSchedule[], note: string): Cell[][] {
  const head = ["GL", "Account", "Statement line", "Opening", "Debits", "Credits", "Closing", "Per trial balance", "Items listed", "Decisions", "Reconciliations", "Owner", "Reviewer", "Status"].map((h) => bold(h));
  const rows = list.map((s): Cell[] => [
    s.gl, s.description, s.statementLine, dr(s.rollForward.opening), dr(s.rollForward.debits), dr(s.rollForward.credits), dr(s.rollForward.closing), dr(s.rollForward.trialBalance),
    int(s.items.length), int(s.decisions.length), int(s.recs.length), s.owner, s.reviewer, statusLabel(s.status),
  ]);
  return [head, ...rows, [], [note]];
}

export function scheduleWorkbook(list: AccountSchedule[], note: string): Sheet[] {
  return [
    { name: "Summary", rows: summaryRows(list, note), widths: [10, 38, 30, 18, 18, 18, 18, 18, 12, 12, 16, 22, 22, 18] },
    ...list.map((s) => ({ name: `${s.gl} ${s.description}`, rows: [...scheduleRows(s), [], [note]], widths: [34, 18, 28, 36, 18, 12, 24, 24, 24, 40] })),
  ];
}
