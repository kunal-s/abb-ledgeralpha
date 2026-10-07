// My Work: the queue of one role across modules (docs/FRD.md §6.2). Everything
// here is derived from the same state the modules read, so an item leaves the
// queue the moment the work behind it is done. A role holds more than one
// person in the roster, and the workflow lets any of them act, so the queue is
// the role's; each row still names the person it is with.

import type { Decision, FollowUp, IsoDate, RoleId } from "@/types";
import { LINE_BY_KEY, PERSON_BY_ID, WORLD } from "@/data";
import { can } from "@/config/roles";
import { CASH_APP_POLICY } from "@/config/policies";
import type { PbcState } from "@/engine/audit";
import { dateOfWd } from "@/lib/workdays";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINRCompact } from "@/lib/format";
import { parseRecItemKey } from "@/engine/recs";
import { personForRole } from "@/state/workflow";
import type { Review } from "@/state/hooks";
import type { RecRow } from "@/state/recHooks";
import type { ReceiptRow } from "@/state/cashAppHooks";
import type { JournalRow } from "@/state/journalHooks";
import type { CloseModel } from "@/state/closeModel";

export type WorkKind = "approval" | "tax-review" | "sign-off" | "rec" | "match" | "journal" | "follow-up" | "request" | "close-task" | "rework";

export const WORK_KINDS: { kind: WorkKind; label: string }[] = [
  { kind: "approval", label: "Approvals" },
  { kind: "tax-review", label: "Tax reviews" },
  { kind: "sign-off", label: "Sign-offs" },
  { kind: "rec", label: "Reconciliations to prepare" },
  { kind: "match", label: "Matches to confirm" },
  { kind: "journal", label: "Journals to review" },
  { kind: "follow-up", label: "Follow-ups" },
  { kind: "request", label: "Auditor requests" },
  { kind: "close-task", label: "Close tasks" },
  { kind: "rework", label: "Rejected, to rework" },
];

export const WORK_KIND_LABEL = Object.fromEntries(WORK_KINDS.map((k) => [k.kind, k.label])) as Record<WorkKind, string>;

export interface WorkItem {
  id: string;
  kind: WorkKind;
  /** module id, for the module column and filter */
  module: string;
  title: string;
  detail: string;
  /** the person it is with */
  ownerId?: string;
  due?: IsoDate;
  overdue: boolean;
  value?: number;
  /** opens the item drawer */
  itemKey?: string;
  /** opens a page */
  link?: string;
  /** what the row can do in place */
  decisionId?: string;
  signOff?: { ref: string; as: "preparer" | "reviewer" };
  receiptKey?: string;
  followUpId?: string;
  closeTaskId?: string;
  requestId?: string;
}

export interface WorkInput {
  role: RoleId;
  today: IsoDate;
  review: Review;
  recRows: RecRow[];
  receipts: ReceiptRow[];
  journals: JournalRow[];
  decisions: Record<string, Decision>;
  followUps: Record<string, FollowUp>;
  pbc: PbcState[];
  close: CloseModel;
}

const roleOf = (personId?: string): RoleId | undefined => (personId ? PERSON_BY_ID.get(personId)?.roleId : undefined);
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s);

function describeItem(itemKey: string): string {
  const rec = parseRecItemKey(itemKey);
  if (rec) return rec.recId;
  const l = LINE_BY_KEY.get(itemKey);
  return l ? `${l.docNo}${l.text ? `, ${l.text}` : ""}` : itemKey;
}

export function buildWork(i: WorkInput): WorkItem[] {
  const out: WorkItem[] = [];
  const me = personForRole(i.role);
  const isOverdue = (due?: IsoDate) => !!due && due < i.today;

  // approvals and tax reviews waiting for the role
  for (const d of Object.values(i.decisions)) {
    if (d.status === "proposed") {
      const next = d.chain[d.approvals.length];
      if (next === i.role && d.proposedBy !== me.id && !d.approvals.some((a) => a.personId === me.id)) {
        const proposer = PERSON_BY_ID.get(d.proposedBy)?.name;
        out.push({
          id: `approval:${d.id}`, kind: "approval", module: d.module, title: `${d.action}: ${clip(describeItem(d.itemKey), 70)}`,
          detail: `Band ${d.approvalBandId}, proposed by ${proposer}${d.justification ? `. ${clip(d.justification, 70)}` : ""}`,
          ownerId: me.id, overdue: false, value: Math.abs(d.amount), itemKey: d.itemKey, decisionId: d.id,
        });
      }
      if (d.taxReviewRequired && !d.taxReview && can(i.role, "tax-review") && d.proposedBy !== me.id) {
        out.push({
          id: `tax:${d.id}`, kind: "tax-review", module: d.module, title: `Tax review: ${d.action} ${clip(describeItem(d.itemKey), 60)}`,
          detail: `Band ${d.approvalBandId}, proposed by ${PERSON_BY_ID.get(d.proposedBy)?.name}`,
          ownerId: me.id, overdue: false, value: Math.abs(d.amount), itemKey: d.itemKey, decisionId: d.id,
        });
      }
    }
    if (d.status === "rejected" && roleOf(d.proposedBy) === i.role) {
      out.push({
        id: `rework:${d.id}`, kind: "rework", module: d.module, title: `${d.action} rejected: ${clip(describeItem(d.itemKey), 60)}`,
        detail: d.rejection ? `${PERSON_BY_ID.get(d.rejection.personId)?.name}: ${clip(d.rejection.reason, 80)}` : "Rejected",
        ownerId: d.proposedBy, overdue: false, value: Math.abs(d.amount), itemKey: d.itemKey,
      });
    }
  }

  // sign-offs: as reviewer once the preparer has signed, as preparer once the work is ready
  if (can(i.role, "sign-reviewer")) {
    for (const a of i.review.accounts) {
      if (a.status !== "preparer-signed" || a.signOff!.preparer!.personId === me.id) continue; // four-eyes: not one's own sign-off
      out.push({
        id: `signoff:${a.summary.gl.gl}`, kind: "sign-off", module: "balance-sheet-review", title: `Sign off ${a.summary.gl.description}`, detail: `${a.summary.gl.gl}, signed by ${PERSON_BY_ID.get(a.signOff!.preparer!.personId)?.name}`,
        ownerId: a.summary.gl.reviewerId, overdue: false, value: Math.abs(a.summary.closing), link: `/balance-sheet-review/${a.summary.gl.gl}`, signOff: { ref: a.summary.gl.gl, as: "reviewer" },
      });
    }
    for (const r of i.recRows) {
      if (r.status !== "preparer-signed" || r.signOff!.preparer!.personId === me.id) continue;
      out.push({
        id: `signoff:${r.rec.id}`, kind: "sign-off", module: "reconciliations", title: `Sign off ${r.rec.name}`, detail: `${r.rec.type}, signed by ${PERSON_BY_ID.get(r.signOff!.preparer!.personId)?.name}`,
        ownerId: r.rec.reviewerId, due: r.rec.dueDate, overdue: isOverdue(r.rec.dueDate), value: Math.abs(r.rec.booksBalance), link: `/reconciliations/${r.rec.id}`, signOff: { ref: r.rec.id, as: "reviewer" },
      });
    }
  }
  if (can(i.role, "sign-preparer")) {
    for (const a of i.review.accounts) {
      if (a.status !== "ready-for-signoff" || roleOf(a.summary.gl.ownerId) !== i.role) continue;
      out.push({
        id: `signoff:${a.summary.gl.gl}`, kind: "sign-off", module: "balance-sheet-review", title: `Sign off ${a.summary.gl.description} as preparer`, detail: `${a.summary.gl.gl}, ready for sign-off`,
        ownerId: a.summary.gl.ownerId, overdue: false, value: Math.abs(a.summary.closing), link: `/balance-sheet-review/${a.summary.gl.gl}`, signOff: { ref: a.summary.gl.gl, as: "preparer" },
      });
    }
    for (const r of i.recRows) {
      if (r.status !== "ready-for-signoff" || roleOf(r.rec.preparerId) !== i.role) continue;
      out.push({
        id: `signoff:${r.rec.id}`, kind: "sign-off", module: "reconciliations", title: `Sign off ${r.rec.name} as preparer`, detail: `${r.rec.type}, ready for sign-off`,
        ownerId: r.rec.preparerId, due: r.rec.dueDate, overdue: isOverdue(r.rec.dueDate), value: Math.abs(r.rec.booksBalance), link: `/reconciliations/${r.rec.id}`, signOff: { ref: r.rec.id, as: "preparer" },
      });
    }
  }

  // reconciliations the role prepares
  for (const r of i.recRows) {
    if (roleOf(r.rec.preparerId) !== i.role) continue;
    if (r.status !== "not-started" && r.status !== "in-review" && r.status !== "reopened") continue;
    const v = r.view;
    const detail = !v.prepared ? "Not yet prepared" : r.rec.reply && !v.work?.source ? "Reply received, not yet applied" : r.blockers[0] ?? "In review";
    out.push({
      id: `rec:${r.rec.id}`, kind: "rec", module: "reconciliations", title: r.rec.name, detail: `${r.rec.type}. ${detail}`,
      ownerId: r.rec.preparerId, due: r.rec.dueDate, overdue: isOverdue(r.rec.dueDate), value: Math.abs(v.unexplained ?? v.difference ?? 0), link: `/reconciliations/${r.rec.id}`,
    });
  }

  // matches the matcher is confident enough to propose
  if (i.role === "ar-specialist") {
    for (const r of i.receipts) {
      if ((r.status !== "ready" && r.status !== "suggested") || !r.best) continue;
      out.push({
        id: `match:${r.key}`, kind: "match", module: "cash-application", title: `Confirm the match for ${r.customerName ?? "receipt " + (r.receipt.utr ?? r.receipt.docNo)}`,
        detail: `${r.best.invoices.length} ${r.best.invoices.length === 1 ? "invoice" : "invoices"}, confidence ${r.best.confidence.toFixed(2)}${r.best.confidence >= CASH_APP_POLICY.bulkConfirmFrom ? ", can be confirmed in bulk" : ""}`,
        ownerId: me.id, overdue: false, value: r.receipt.amount, link: `/cash-application/${r.key}`, receiptKey: r.key,
      });
    }
  }

  // flagged journals waiting for a reviewer
  if (can(i.role, "sign-reviewer")) {
    for (const j of i.journals) {
      if (j.status !== "flagged") continue;
      out.push({
        id: `journal:${j.doc.key}`, kind: "journal", module: "journals", title: `Review journal ${j.doc.docNo}${j.doc.text ? `, ${clip(j.doc.text, 50)}` : ""}`,
        detail: `${j.flags.map((f) => f.checkId).join(", ")}, entered ${fmtDate(j.doc.entryDate)}`,
        ownerId: me.id, overdue: false, value: j.doc.amount, link: `/journals/${j.doc.key}`,
      });
    }
  }

  // follow-ups the role raised that need closing or chasing, and those asked of it
  const roleNames = WORLD.people.filter((p) => p.roleId === i.role).map((p) => p.name);
  for (const f of Object.values(i.followUps)) {
    if (f.status === "closed") continue;
    const raisedByRole = roleOf(f.createdBy) === i.role;
    const askedOfRole = roleNames.some((n) => f.owner.includes(n));
    if (!raisedByRole && !askedOfRole) continue;
    const overdue = f.status === "open" && isOverdue(f.dueDate);
    out.push({
      id: `followup:${f.id}`, kind: "follow-up", module: f.module, title: clip(f.message, 90),
      detail: f.status === "responded" ? `Answered by ${f.response ? PERSON_BY_ID.get(f.response.by)?.name : f.owner}; close it` : `Asked of ${f.owner}`,
      ownerId: f.createdBy, due: f.dueDate, overdue, itemKey: f.itemKey, followUpId: f.id,
    });
  }

  // auditor requests the role owns
  for (const s of i.pbc) {
    if (roleOf(s.ownerId) !== i.role || (s.status !== "open" && s.status !== "in-preparation")) continue;
    out.push({
      id: `request:${s.req.id}`, kind: "request", module: "audit-readiness", title: s.req.title, detail: `${s.req.id}, ${s.progress ? s.progress.label : s.req.area}${s.blocker ? ". Waiting on review work" : ""}`,
      ownerId: s.ownerId, due: s.req.due, overdue: s.overdue, link: `/audit-readiness?tab=requests&req=${s.req.id}`, requestId: s.req.id,
    });
  }

  // close tasks the role owns that are open, started or about to start
  for (const s of i.close.evaluation.states) {
    if (s.status === "complete" || roleOf(s.ownerId) !== i.role) continue;
    if (s.task.startWd > i.close.currentWd + 1 && !s.late) continue;
    const due = dateOfWd(i.close.periodEnd, s.task.dueWd);
    out.push({
      id: `close:${s.task.id}`, kind: "close-task", module: "close", title: s.task.name, detail: `${s.task.id}, ${s.blocker ? `blocked: ${s.blocker.reason}` : s.label}`,
      ownerId: s.ownerId, due, overdue: s.late, link: `/close?tab=checklist&task=${s.task.id}`, closeTaskId: s.task.id,
    });
  }

  return out;
}

/** When something is due, in the buckets the queue is read by. */
export type DueBucket = "overdue" | "week" | "later" | "none";

export function dueBucket(item: WorkItem, today: IsoDate): DueBucket {
  if (item.overdue) return "overdue";
  if (!item.due) return "none";
  return daysBetween(today, item.due) <= 7 ? "week" : "later";
}

/** Overdue first, then what is due soonest, then the largest value. */
export function urgency(a: WorkItem, b: WorkItem): number {
  return Number(b.overdue) - Number(a.overdue) || (a.due ?? "9999").localeCompare(b.due ?? "9999") || (b.value ?? 0) - (a.value ?? 0);
}

export const valueText = (item: WorkItem) => (item.value ? fmtINRCompact(item.value) : "-");
