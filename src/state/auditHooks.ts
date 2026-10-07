// Audit Readiness models: the auditor's requests with progress taken from the
// sign-offs, the schedules assembled from the Balance Sheet Review and the
// Reconciliations (so the figures are the same figures), and the evidence index.

import { useMemo } from "react";
import type { Decision, IsoDate, PbcRequest } from "@/types";
import { BALANCES, GL_BY_ID, LINE_BY_KEY, PARTY_BY_ID, PERSON_BY_ID, WORLD, balanceAt } from "@/data";
import { PBC_REQUESTS } from "@/data/workspace/pbc";
import { TENANT } from "@/config/tenant";
import { ROLES } from "@/config/roles";
import { AGEING_POLICY, MATERIALITY_POLICY } from "@/config/policies";
import { LOCALISATION } from "@/config/localisation";
import { BUCKETS } from "@/engine/review";
import { parseRecItemKey } from "@/engine/recs";
import { pbcState, type AuditInputs, type PbcState } from "@/engine/audit";
import { readinessOf, type AccountSchedule, type ScheduleDecision, type ScheduleItem, type ScheduleRec } from "@/engine/schedule";
import { useReview } from "@/state/ReviewContext";
import { useRecRows, type RecRow } from "@/state/recHooks";
import { useJournals } from "@/state/journalHooks";
import { nowLocal, useWorkflow } from "@/state/workflow";
import type { AccountRow, Review } from "@/state/hooks";
import { CATEGORY_LABELS } from "@/lib/labels";
import { addDays, fmtDate, fmtDateTime } from "@/lib/dates";
import { fmtINR } from "@/lib/format";

const DECISION_STATUS: Record<Decision["status"], string> = {
  proposed: "Proposed", approved: "Approved", exported: "Exported", "closed-in-erp": "Closed in ERP", rejected: "Rejected", withdrawn: "Withdrawn",
};

const nameOf = (id?: string) => (id ? PERSON_BY_ID.get(id)?.name ?? id : "");

/** What the requests that depend on platform work read: account and reconciliation sign-offs and journal reviews. */
export function useAuditInputs(): AuditInputs {
  const review = useReview();
  const recRows = useRecRows();
  const { flagged } = useJournals();
  return useMemo(
    () => ({
      accounts: review.accounts.map((a) => ({ category: a.summary.gl.category, status: a.status })),
      recs: recRows.map((r) => ({ type: r.rec.type, status: r.status })),
      journals: flagged.map((r) => ({ reviewed: r.status === "accepted" })),
    }),
    [review.accounts, recRows, flagged]
  );
}

/** The auditor's list, then the requests raised in the session. */
export function useRequests(): PbcRequest[] {
  const raised = useWorkflow((s) => s.pbcRaised);
  return useMemo(() => [...PBC_REQUESTS, ...raised], [raised]);
}

export function usePbc(): { states: PbcState[]; inputs: AuditInputs; today: IsoDate } {
  const inputs = useAuditInputs();
  const requests = useRequests();
  const work = useWorkflow((s) => s.pbc);
  const today = nowLocal().slice(0, 10);
  return useMemo(() => ({ states: requests.map((r) => pbcState(r, work[r.id], inputs, today)), inputs, today }), [requests, work, inputs, today]);
}

// ---------------------------------------------------------------------------
// schedules
// ---------------------------------------------------------------------------
function statutoryBands(category: string): readonly { label: string; maxMonths: number | null }[] | undefined {
  if (category === "trade-recv") return LOCALISATION.disclosureAgeing.tradeReceivables;
  if (category === "trade-pay" || category === "cwip") return LOCALISATION.disclosureAgeing.tradePayablesAndCwip;
  return undefined;
}

const approvalsText = (d: Decision) => {
  const parts = d.approvals.map((a) => `${ROLES[a.roleId].label} ${fmtDate(a.at.slice(0, 10))}`);
  if (d.taxReview) parts.push(`Tax ${d.taxReview.outcome} ${fmtDate(d.taxReview.at.slice(0, 10))}`);
  return parts.join("; ") || "None yet";
};

/** The control account category each counterparty reconciliation sits on. */
const PARTY_CATEGORY = { "Customer statement": "trade-recv", "Vendor statement": "trade-pay", Intercompany: "intercompany" } as const;

let partyAccounts: Map<string, Map<string, number>> | undefined;

/** For each counterparty, the control accounts it has postings on and how many. */
function partyAccountCounts(): Map<string, Map<string, number>> {
  if (partyAccounts) return partyAccounts;
  const categories = new Set<string>(Object.values(PARTY_CATEGORY));
  const out = new Map<string, Map<string, number>>();
  for (const l of WORLD.lines) {
    if (!l.partner || !categories.has(GL_BY_ID.get(l.gl)!.category)) continue;
    const m = out.get(l.partner.id) ?? new Map<string, number>();
    m.set(l.gl, (m.get(l.gl) ?? 0) + 1);
    out.set(l.partner.id, m);
  }
  partyAccounts = out;
  return out;
}

/** The accounts a reconciliation supports: its own account, or the control account its counterparty is booked on (an intercompany one may span two). */
function accountsOfRec(r: RecRow): string[] {
  if (r.rec.gl) return [r.rec.gl];
  const category = PARTY_CATEGORY[r.rec.type as keyof typeof PARTY_CATEGORY];
  const counts = r.rec.partyId ? partyAccountCounts().get(r.rec.partyId) : undefined;
  if (!category || !counts) return [];
  const own = [...counts.entries()].filter(([gl]) => GL_BY_ID.get(gl)!.category === category);
  if (r.rec.type === "Intercompany") return own.map(([gl]) => gl);
  return own.sort((a, b) => b[1] - a[1]).slice(0, 1).map(([gl]) => gl);
}

/** The reconciliations whose books balance is made up of this account. */
function recsOf(gl: string, recRows: RecRow[]): RecRow[] {
  return recRows.filter((r) => accountsOfRec(r).includes(gl));
}

export function buildSchedule(a: AccountRow, review: Review, recRows: RecRow[], decisions: Decision[]): AccountSchedule {
  const g = a.summary.gl;
  const asOf = review.asOf;
  const prior = review.priorDate;

  const months = BALANCES.periods.filter((p) => p > prior && p <= asOf);
  let debits = 0;
  let credits = 0;
  for (const m of months) {
    const b = balanceAt(BALANCES, g.gl, m);
    debits += b?.debits ?? 0;
    credits += b?.credits ?? 0;
  }
  const opening = balanceAt(BALANCES, g.gl, prior)?.closing ?? 0;
  const trialBalance = balanceAt(BALANCES, g.gl, asOf)?.closing ?? 0;
  const closing = a.summary.closing;

  const glRows = review.rows.filter((r) => r.item.gl === g.gl);
  const openRows = glRows.filter((r) => r.isOpen);
  const ageing = g.openItemManaged ? BUCKETS.map((b) => ({ label: b.label, count: a.summary.byBucket[b.id].count, amount: a.summary.byBucket[b.id].amount })) : [];

  const bands = g.openItemManaged ? statutoryBands(g.category) : undefined;
  let statutory: AccountSchedule["statutory"];
  if (bands && openRows.length) {
    statutory = bands.map((b) => ({ label: b.label, count: 0, amount: 0 }));
    for (const r of openRows) {
      const months = r.age / 30.4375;
      const i = bands.findIndex((b) => b.maxMonths === null || months < b.maxMonths);
      statutory[i].count += 1;
      statutory[i].amount += Math.abs(r.item.amount);
    }
  }

  const items: ScheduleItem[] = glRows
    .filter((r) => r.flagged || (r.isOpen && r.age > AGEING_POLICY.reviewThresholdDays))
    .sort((x, y) => Math.abs(y.item.amount) - Math.abs(x.item.amount))
    .slice(0, 1000)
    .map((r) => {
      const d = r.decision;
      const f = r.followUp && r.followUp.status !== "closed" ? r.followUp : undefined;
      return {
        key: r.key,
        docNo: r.item.docNo,
        date: r.item.postingDate,
        party: r.item.partner ? PARTY_BY_ID.get(r.item.partner.id)?.name ?? "" : "",
        text: r.item.text ?? "",
        amount: r.item.amount,
        age: r.age,
        rules: r.hits.map((h) => h.ruleId).join(" "),
        status: d ? `${d.action}, ${DECISION_STATUS[d.status].toLowerCase()}` : f ? (f.status === "responded" ? "Follow-up answered" : "Follow-up open") : r.flagged ? "Flagged, no action yet" : "Above the review threshold",
        support: d?.id ?? f?.id ?? "",
        comment: r.rec && !d ? `Recommended: ${r.rec.action}. ${r.rec.nextStep}` : "",
      };
    });

  const recList = recsOf(g.gl, recRows);
  const recIds = new Set(recList.map((r) => r.rec.id));
  const scheduleDecisions: ScheduleDecision[] = decisions
    .filter((d) => {
      if (d.status === "withdrawn") return false;
      const rec = parseRecItemKey(d.itemKey);
      return rec ? recIds.has(rec.recId) : LINE_BY_KEY.get(d.itemKey)?.gl === g.gl;
    })
    .sort((x, y) => x.proposedAt.localeCompare(y.proposedAt))
    .map((d) => {
      const rec = parseRecItemKey(d.itemKey);
      const line = LINE_BY_KEY.get(d.itemKey);
      return {
        id: d.id,
        item: rec ? `${rec.recId} ${recRows.find((r) => r.rec.id === rec.recId)?.view.items.find((i) => i.id === rec.itemId)?.narration ?? rec.itemId}` : line?.docNo ?? d.itemKey,
        action: d.action,
        amount: Math.abs(d.amount),
        band: d.approvalBandId,
        proposedBy: nameOf(d.proposedBy),
        proposedAt: fmtDateTime(d.proposedAt),
        approvals: approvalsText(d),
        status: DECISION_STATUS[d.status],
      };
    });

  const schedRecs: ScheduleRec[] = recList.map((r) => ({
    id: r.rec.id,
    name: r.rec.name,
    type: r.rec.type,
    books: r.rec.booksBalance,
    source: r.view.sourceBalance,
    difference: r.view.difference,
    unexplained: r.view.unexplained,
    items: r.view.items.length,
    status: r.status,
  }));

  const so = a.signOff;
  const blockers: string[] = [];
  if (a.status !== "reviewer-signed") {
    if (!so?.preparer) {
      if (a.readiness.undocumented.length) blockers.push(`${a.readiness.undocumented.length} flagged item${a.readiness.undocumented.length === 1 ? "" : "s"} of ${fmtINR(MATERIALITY_POLICY.documentedActionAmount)} or more without a decision or follow-up`);
      if (!a.hasCommentary) blockers.push("Commentary not saved");
      blockers.push("Preparer has not signed off");
    } else if (!so.reviewer) blockers.push("Waiting for the reviewer to sign off");
  }
  for (const r of recList) if (r.status !== "reviewer-signed") blockers.push(`${r.rec.name} is not signed off`);

  return {
    entity: TENANT.legalEntities[0].name,
    gl: g.gl,
    description: g.description,
    statementLine: g.statementLine,
    category: CATEGORY_LABELS[g.category],
    period: asOf,
    priorDate: prior,
    owner: nameOf(g.ownerId),
    reviewer: nameOf(g.reviewerId),
    riskTier: g.riskTier,
    rollForward: { opening, debits, credits, closing, trialBalance, ties: Math.abs(opening + debits + credits - trialBalance) < 0.5 && Math.abs(closing - trialBalance) < 0.5 },
    ageing,
    statutory,
    items,
    decisions: scheduleDecisions,
    recs: schedRecs,
    commentary: so?.commentary,
    preparer: so?.preparer ? `${nameOf(so.preparer.personId)}, ${fmtDateTime(so.preparer.at)}` : undefined,
    reviewerSignOff: so?.reviewer ? `${nameOf(so.reviewer.personId)}, ${fmtDateTime(so.reviewer.at)}` : undefined,
    status: a.status,
    readiness: readinessOf(a.status),
    blockers,
  };
}

export function useSchedules(): AccountSchedule[] {
  const review = useReview();
  const recRows = useRecRows();
  const decisions = useWorkflow((s) => s.decisions);
  return useMemo(() => {
    const ds = Object.values(decisions);
    return review.accounts.map((a) => buildSchedule(a, review, recRows, ds));
  }, [review, recRows, decisions]);
}

// ---------------------------------------------------------------------------
// evidence index
// ---------------------------------------------------------------------------
export interface EvidenceRow {
  id: string;
  type: "Account sign-off" | "Reconciliation sign-off" | "Decision" | "Journal review" | "Request provided";
  reference: string;
  description: string;
  by: string;
  at: string;
  link?: string;
}

export function useEvidence(): EvidenceRow[] {
  const signOffs = useWorkflow((s) => s.signOffs);
  const decisions = useWorkflow((s) => s.decisions);
  const journalReviews = useWorkflow((s) => s.journalReviews);
  const pbc = useWorkflow((s) => s.pbc);
  const requests = useRequests();
  return useMemo(() => {
    const out: EvidenceRow[] = [];
    for (const so of Object.values(signOffs)) {
      if (!so.preparer || so.periodEnd !== WORLD.asOf) continue;
      const rec = WORLD.reconciliations.find((r) => r.id === so.gl);
      const gl = GL_BY_ID.get(so.gl);
      if (!rec && !gl) continue;
      const parts = [`Preparer ${nameOf(so.preparer.personId)}, ${fmtDate(so.preparer.at.slice(0, 10))}`];
      if (so.reviewer) parts.push(`Reviewer ${nameOf(so.reviewer.personId)}, ${fmtDate(so.reviewer.at.slice(0, 10))}`);
      out.push({
        id: `so-${so.gl}`,
        type: rec ? "Reconciliation sign-off" : "Account sign-off",
        reference: rec ? rec.id : so.gl,
        description: `${rec ? rec.name : gl!.description}. ${parts.join("; ")}`,
        by: nameOf((so.reviewer ?? so.preparer).personId),
        at: (so.reviewer ?? so.preparer).at,
        link: rec ? `/reconciliations/${rec.id}` : `/balance-sheet-review/${so.gl}`,
      });
    }
    for (const d of Object.values(decisions)) {
      if (d.status === "withdrawn" || d.status === "proposed") continue;
      const rec = parseRecItemKey(d.itemKey);
      const line = LINE_BY_KEY.get(d.itemKey);
      out.push({
        id: d.id,
        type: "Decision",
        reference: d.id,
        description: `${d.action} of ${fmtINR(Math.abs(d.amount))} on ${rec ? rec.recId : line?.docNo ?? d.itemKey}, band ${d.approvalBandId}. ${DECISION_STATUS[d.status]}: ${approvalsText(d)}`,
        by: nameOf(d.proposedBy),
        at: d.approvals[d.approvals.length - 1]?.at ?? d.proposedAt,
      });
    }
    for (const jr of Object.values(journalReviews)) {
      if (jr.outcome !== "accepted") continue; // a request for support is work in progress, not evidence
      out.push({
        id: `jr-${jr.docKey}`,
        type: "Journal review",
        reference: jr.docKey.split("-").slice(1).join("-"),
        description: `Accepted: ${jr.note}`,
        by: nameOf(jr.personId),
        at: jr.at,
        link: `/journals/${jr.docKey}`,
      });
    }
    for (const q of requests) {
      const w = pbc[q.id];
      const status = w?.status ?? q.seedStatus;
      if (status !== "provided" && status !== "closed") continue;
      const evidence = w?.evidence ?? q.seedEvidence;
      if (!evidence) continue;
      out.push({ id: `pbc-${q.id}`, type: "Request provided", reference: q.id, description: `${q.title}. ${evidence}`, by: nameOf(w?.ownerId ?? q.ownerId), at: w?.at ?? `${addDays(q.requestedOn, 2)}T15:30` });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at));
  }, [signOffs, decisions, journalReviews, pbc, requests]);
}
