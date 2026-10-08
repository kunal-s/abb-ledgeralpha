// Home: the headline numbers of the close and what needs attention first,
// across modules (docs/FRD.md §6.1). Pure, over the models the modules read.

import type { Decision, IsoDate, RoleId } from "@/types";
import { LINE_BY_KEY } from "@/data";
import { staleBalances, type StaleAccount } from "@/engine/reviewStory";
import { BUCKETS, bucketOf, type BucketId } from "@/engine/review";
import { MATERIALITY_POLICY } from "@/config/policies";
import type { PbcState } from "@/engine/audit";
import { wdLabel } from "@/lib/workdays";
import { daysBetween } from "@/lib/dates";
import { fmtINRCompact } from "@/lib/format";
import type { Review } from "@/state/hooks";
import type { RecRow } from "@/state/recHooks";
import type { ReceiptRow } from "@/state/cashAppHooks";
import type { JournalRow } from "@/state/journalHooks";
import type { CloseModel } from "@/state/closeModel";

/** What the home page shows to a role: leaders the close, operators their queue, the auditor the audit. */
export type HomeView = "leader" | "operator" | "auditor";

export function homeViewOf(role: RoleId): HomeView {
  if (role === "external-auditor") return "auditor";
  return role === "cfo" || role === "head-of-finance" || role === "controller" || role === "controls-lead" ? "leader" : "operator";
}

export interface HomeKpis {
  closeProgress: number;
  accountsSigned: number;
  accountsTotal: number;
  recsSigned: number;
  recsTotal: number;
  exceptions: number;
  exceptionsValue: number;
  approvals: number;
  approvalsForRole: number;
}

/** The balance sheet at risk: open flagged value by ageing bucket, and the accounts with the oldest flagged balances. */
export interface BalanceRisk {
  byBucket: Record<BucketId, { count: number; amount: number }>;
  flaggedValue: number;
  flaggedCount: number;
  stale: StaleAccount[];
}

/** Reconciliation health by type: how much is still unexplained outside tolerance, and how many are certified. */
export interface RecHealth {
  type: string;
  total: number;
  signed: number;
  outside: number;
  unexplained: number;
}

export type AttentionKind = "close" | "reconciliation" | "item" | "journal" | "request" | "receipt" | "approval";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  detail: string;
  value?: number;
  /** how urgent the kind of thing is, before its value */
  rank: number;
  itemKey?: string;
  link?: string;
}

export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  close: "Close", reconciliation: "Reconciliation", item: "Balance sheet", journal: "Journal", request: "Auditor request", receipt: "Receipt", approval: "Approval",
};

export interface HomeInput {
  role: RoleId;
  today: IsoDate;
  review: Review;
  recRows: RecRow[];
  journals: JournalRow[];
  receipts: ReceiptRow[];
  decisions: Record<string, Decision>;
  pbc: PbcState[];
  close: CloseModel;
}

const MAX_PER_KIND = 3;

export function buildHome(i: HomeInput): { kpis: HomeKpis; attention: AttentionItem[]; risk: BalanceRisk; recHealth: RecHealth[] } {
  const proposed = Object.values(i.decisions).filter((d) => d.status === "proposed");
  const required = i.review.accounts.flatMap((a) => a.readiness.undocumented);
  const kpis: HomeKpis = {
    closeProgress: i.close.evaluation.progress,
    accountsSigned: i.review.accounts.filter((a) => a.status === "reviewer-signed").length,
    accountsTotal: i.review.accounts.length,
    recsSigned: i.recRows.filter((r) => r.status === "reviewer-signed").length,
    recsTotal: i.recRows.length,
    exceptions: required.length,
    exceptionsValue: required.reduce((s, l) => s + Math.abs(l.amount), 0),
    approvals: proposed.length,
    approvalsForRole: proposed.filter((d) => d.chain[d.approvals.length] === i.role).length,
  };

  const candidates: AttentionItem[] = [];

  for (const s of i.close.evaluation.states) {
    if (s.status === "complete" || (!s.late && s.status !== "blocked")) continue;
    candidates.push({
      id: `close:${s.task.id}`, kind: "close", title: s.task.name, rank: s.status === "blocked" ? 5 : 4,
      detail: s.blocker ? `Blocked: ${s.blocker.reason}` : `Late by ${s.lateBy} ${s.lateBy === 1 ? "day" : "days"}, ${s.label}${s.critical ? ", on the critical path" : ""}`,
      link: `/close?tab=checklist&task=${s.task.id}`,
    });
  }

  for (const r of i.recRows) {
    if (r.status === "reviewer-signed" || r.status === "preparer-signed") continue;
    if (r.view.unexplained === null || r.view.withinTolerance) continue;
    candidates.push({
      id: `rec:${r.rec.id}`, kind: "reconciliation", title: r.rec.name, rank: 4, value: Math.abs(r.view.unexplained),
      detail: `${r.rec.type}, unexplained ${fmtINRCompact(Math.abs(r.view.unexplained))}, outside the tolerance`, link: `/reconciliations/${r.rec.id}`,
    });
  }

  const undocumented = i.review.rows
    .filter((r) => r.flagged && r.isOpen && !r.decision && !r.followUp && Math.abs(r.item.amount) >= MATERIALITY_POLICY.documentedActionAmount)
    .sort((a, b) => Math.abs(b.item.amount) - Math.abs(a.item.amount))
    .slice(0, 12);
  for (const r of undocumented) {
    candidates.push({
      id: `item:${r.key}`, kind: "item", title: `${r.item.docNo}, ${r.item.text ?? r.item.gl}`, rank: 3, value: Math.abs(r.item.amount),
      detail: `${r.age} days old, ${r.rec ? `${r.rec.action} recommended` : "flagged"}`, itemKey: r.key,
    });
  }

  for (const j of i.journals) {
    if (j.status !== "flagged" || j.severity !== "high") continue;
    candidates.push({
      id: `journal:${j.doc.key}`, kind: "journal", title: `Journal ${j.doc.docNo}${j.doc.text ? `, ${j.doc.text}` : ""}`, rank: 4, value: j.doc.amount,
      detail: `${j.flags.map((f) => f.checkId).join(", ")}, awaiting review`, link: `/journals/${j.doc.key}`,
    });
  }

  for (const s of i.pbc) {
    if (!s.overdue) continue;
    candidates.push({ id: `request:${s.req.id}`, kind: "request", title: s.req.title, rank: 4, detail: `${s.req.id}, due ${s.req.due}, ${s.progress?.label ?? s.status}`, link: `/audit-readiness?tab=requests&req=${s.req.id}` });
  }

  for (const r of i.receipts.filter((x) => x.status === "unmatched" && x.age > 60).sort((a, b) => b.receipt.amount - a.receipt.amount).slice(0, 4)) {
    candidates.push({ id: `receipt:${r.key}`, kind: "receipt", title: `Receipt ${r.receipt.utr ?? r.receipt.docNo}, no match`, rank: 3, value: r.receipt.amount, detail: `${r.age} days in clearing`, link: `/cash-application/${r.key}` });
  }

  for (const d of proposed.filter((x) => daysBetween(x.proposedAt.slice(0, 10), i.today) >= 2)) {
    const l = LINE_BY_KEY.get(d.itemKey);
    candidates.push({ id: `approval:${d.id}`, kind: "approval", title: `${d.action} waiting for approval${l ? `, ${l.docNo}` : ""}`, rank: 3, value: Math.abs(d.amount), detail: `Proposed ${daysBetween(d.proposedAt.slice(0, 10), i.today)} days ago, band ${d.approvalBandId}`, itemKey: d.itemKey });
  }

  const taken: Record<string, number> = {};
  const attention = candidates
    .sort((a, b) => b.rank - a.rank || (b.value ?? 0) - (a.value ?? 0))
    .filter((c) => {
      taken[c.kind] = (taken[c.kind] ?? 0) + 1;
      return taken[c.kind] <= MAX_PER_KIND;
    })
    .slice(0, 8);

  // balance sheet at risk: open items flagged by a rule
  const byBucket = Object.fromEntries(BUCKETS.map((b) => [b.id, { count: 0, amount: 0 }])) as BalanceRisk["byBucket"];
  for (const r of i.review.rows) {
    if (!r.flagged || !r.isOpen) continue;
    const b = byBucket[bucketOf(r.age)];
    b.count += 1;
    b.amount += Math.abs(r.item.amount);
  }
  const risk: BalanceRisk = {
    byBucket,
    flaggedValue: Object.values(byBucket).reduce((s, b) => s + b.amount, 0),
    flaggedCount: Object.values(byBucket).reduce((s, b) => s + b.count, 0),
    stale: staleBalances(i.review.rows).slice(0, 6),
  };

  const byType = new Map<string, RecHealth>();
  for (const r of i.recRows) {
    const h = byType.get(r.rec.type) ?? { type: r.rec.type, total: 0, signed: 0, outside: 0, unexplained: 0 };
    h.total += 1;
    if (r.status === "reviewer-signed") h.signed += 1;
    if (r.view.unexplained !== null && !r.view.withinTolerance && r.status !== "reviewer-signed") {
      h.outside += 1;
      h.unexplained += Math.abs(r.view.unexplained);
    }
    byType.set(r.rec.type, h);
  }
  const recHealth = [...byType.values()].sort((a, b) => b.unexplained - a.unexplained);

  return { kpis, attention, risk, recHealth };
}

/** "WD+4 of WD+8", for the close tile. */
export const closeDay = (close: CloseModel) => `${wdLabel(close.currentWd)} of ${wdLabel(close.targetWd)}`;
