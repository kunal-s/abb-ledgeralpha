// Control testing (docs/FRD.md §6.18, D-60): each control in the register is
// tested from what the platform records, so the evidence is collected as the
// work is done and nobody assembles it afterwards. A control is effective when
// everything tested passed, deficient when something failed, in progress while
// the work it covers is still inside its window, and untested when nothing has
// reached it yet. A preventive refusal (a blocked self-approval) is evidence too.

import type { AccountSignOff, ActivityEvent, Decision, IsoDate, JournalReview } from "@/types";
import { CONTROL_REGISTER, type ControlDef } from "@/data/workspace/controls";
import { CONTROL_POLICY } from "@/config/policies";
import { PERSON_BY_ID } from "@/data";
import { addDays } from "@/lib/dates";
import type { JournalRow } from "@/state/journalHooks";
import type { RecRow } from "@/state/recHooks";
import { fmtDate } from "@/lib/dates";

export type ControlStatus = "effective" | "deficient" | "in-progress" | "untested";

export interface Evidence {
  at: string;
  text: string;
  ok: boolean;
  link?: string;
}

export interface ControlResult {
  def: ControlDef;
  status: ControlStatus;
  tested: number;
  exceptions: number;
  /** work the control covers that is still inside its window */
  pending: number;
  evidence: Evidence[];
  lastTested?: string;
}

export interface ControlInput {
  periodEnd: IsoDate;
  today: IsoDate;
  signOffs: Record<string, AccountSignOff>;
  recRows: RecRow[];
  /** balance sheet accounts the reviewer has not yet signed */
  accountsAwaiting: number;
  decisions: Decision[];
  journals: JournalRow[];
  journalReviews: Record<string, JournalReview>;
  events: ActivityEvent[];
}

export interface SodItem {
  at: string;
  kind: "Blocked" | "Conflict";
  text: string;
  link?: string;
}

const name = (id: string | undefined) => (id ? PERSON_BY_ID.get(id)?.name ?? id : "");
const day = (at: string) => at.slice(0, 10);
const latest = (xs: Evidence[]) => [...xs].sort((a, b) => b.at.localeCompare(a.at));

function result(def: ControlDef, tested: number, exceptions: number, pending: number, evidence: Evidence[], pendingOpen: boolean): ControlResult {
  const ev = latest(evidence);
  const status: ControlStatus = exceptions > 0 ? "deficient" : pending > 0 && pendingOpen ? "in-progress" : tested > 0 ? "effective" : "untested";
  return { def, status, tested, exceptions, pending, evidence: ev.slice(0, 6), lastTested: ev[0]?.at };
}

export function evaluateControls(i: ControlInput): { controls: ControlResult[]; sod: SodItem[] } {
  const accountDeadline = addDays(i.periodEnd, CONTROL_POLICY.accountReviewDays);
  const journalDeadline = addDays(i.periodEnd, CONTROL_POLICY.journalReviewDays);
  const so = Object.values(i.signOffs).filter((s) => s.periodEnd === i.periodEnd);
  const sod: SodItem[] = [];
  const out: ControlResult[] = [];

  for (const def of CONTROL_REGISTER) {
    const ev: Evidence[] = [];
    let tested = 0;
    let exceptions = 0;
    let pending = 0;
    let pendingOpen = false;

    switch (def.test) {
      case "review-four-eyes": {
        for (const s of so) {
          if (!s.reviewer || !s.preparer) continue;
          tested += 1;
          const same = s.reviewer.personId === s.preparer.personId;
          if (same) {
            exceptions += 1;
            sod.push({ at: s.reviewer.at, kind: "Conflict", text: `${name(s.reviewer.personId)} prepared and reviewed ${s.gl}`, link: s.gl.startsWith("REC-") ? `/reconciliations/${s.gl}` : `/balance-sheet-review/${s.gl}` });
          }
          ev.push({ at: s.reviewer.at, ok: !same, text: `${s.gl}: prepared by ${name(s.preparer.personId)}, reviewed by ${name(s.reviewer.personId)}`, link: s.gl.startsWith("REC-") ? `/reconciliations/${s.gl}` : `/balance-sheet-review/${s.gl}` });
        }
        break;
      }
      case "review-deadline": {
        for (const s of so.filter((x) => !x.gl.startsWith("REC-"))) {
          if (s.reviewer) {
            tested += 1;
            const late = day(s.reviewer.at) > accountDeadline;
            if (late) exceptions += 1;
            ev.push({ at: s.reviewer.at, ok: !late, text: `${s.gl} signed by ${name(s.reviewer.personId)} on ${fmtDate(day(s.reviewer.at))}${late ? `, after ${fmtDate(accountDeadline)}` : ""}`, link: `/balance-sheet-review/${s.gl}` });
          }
        }
        if (i.today > accountDeadline) {
          tested += i.accountsAwaiting;
          exceptions += i.accountsAwaiting;
          if (i.accountsAwaiting) ev.push({ at: accountDeadline, ok: false, text: `${i.accountsAwaiting} accounts not signed off by ${fmtDate(accountDeadline)}`, link: "/balance-sheet-review?tab=accounts" });
        } else {
          pending = i.accountsAwaiting;
          pendingOpen = true;
        }
        break;
      }
      case "bank-rec-due": {
        for (const r of i.recRows.filter((x) => x.rec.type === "Bank")) {
          const signed = r.signOff?.reviewer ?? r.signOff?.preparer;
          if (signed) {
            tested += 1;
            const late = day(signed.at) > r.rec.dueDate;
            if (late) exceptions += 1;
            ev.push({ at: signed.at, ok: !late, text: `${r.rec.name} certified ${fmtDate(day(signed.at))}, due ${fmtDate(r.rec.dueDate)}`, link: `/reconciliations/${r.rec.id}` });
          } else if (r.rec.dueDate < i.today) {
            tested += 1;
            exceptions += 1;
            ev.push({ at: r.rec.dueDate, ok: false, text: `${r.rec.name} not certified, due ${fmtDate(r.rec.dueDate)}`, link: `/reconciliations/${r.rec.id}` });
          } else pending += 1;
        }
        pendingOpen = true;
        break;
      }
      case "rec-tolerance": {
        for (const r of i.recRows) {
          const s = r.signOff?.reviewer ?? r.signOff?.preparer;
          if (!s || r.view.unexplained === null) continue;
          tested += 1;
          if (!r.view.withinTolerance) exceptions += 1;
          ev.push({ at: s.at, ok: r.view.withinTolerance, text: `${r.rec.name} signed with ${r.view.unexplained === 0 ? "nothing" : "a difference"} unexplained`, link: `/reconciliations/${r.rec.id}` });
        }
        break;
      }
      case "delegation": {
        for (const d of i.decisions.filter((x) => x.approvals.length > 0)) {
          tested += 1;
          const bySelf = d.approvals.some((a) => a.personId === d.proposedBy);
          const inOrder = d.approvals.every((a, k) => a.roleId === d.chain[k]);
          const bad = bySelf || !inOrder;
          if (bad) {
            exceptions += 1;
            if (bySelf) sod.push({ at: d.approvals[0].at, kind: "Conflict", text: `${name(d.proposedBy)} approved their own ${d.action.toLowerCase()}`, link: undefined });
          }
          ev.push({ at: d.approvals[d.approvals.length - 1].at, ok: !bad, text: `${d.action} ${d.id}: approved by ${d.approvals.map((a) => name(a.personId)).join(", ")} in band ${d.approvalBandId}` });
        }
        for (const e of i.events.filter((x) => x.action === "Self-approval blocked")) {
          ev.push({ at: e.at, ok: true, text: `Self-approval blocked: ${name(e.actorId)} could not approve their own decision` });
          sod.push({ at: e.at, kind: "Blocked", text: `${name(e.actorId)} tried to approve their own decision and was refused` });
        }
        pending = i.decisions.filter((d) => d.status === "proposed").length;
        pendingOpen = true;
        break;
      }
      case "tax-review": {
        for (const d of i.decisions.filter((x) => x.taxReviewRequired && (x.status === "approved" || x.status === "exported" || x.status === "closed-in-erp"))) {
          tested += 1;
          const cleared = d.taxReview?.outcome === "cleared";
          if (!cleared) exceptions += 1;
          ev.push({ at: d.taxReview?.at ?? d.approvals[d.approvals.length - 1]?.at ?? d.proposedAt, ok: cleared, text: `${d.action} ${d.id}: tax review ${d.taxReview ? `${d.taxReview.outcome} by ${name(d.taxReview.personId)}` : "missing"}` });
        }
        pending = i.decisions.filter((d) => d.taxReviewRequired && d.status === "proposed").length;
        pendingOpen = true;
        break;
      }
      case "journal-four-eyes": {
        for (const j of i.journals.filter((x) => x.review)) {
          tested += 1;
          const reviewer = PERSON_BY_ID.get(j.review!.personId);
          const same = !!reviewer && reviewer.userId === j.doc.enteredBy;
          if (same) {
            exceptions += 1;
            sod.push({ at: j.review!.at, kind: "Conflict", text: `${reviewer!.name} reviewed a journal they entered`, link: `/journals/${j.doc.key}` });
          }
          ev.push({ at: j.review!.at, ok: !same, text: `Journal ${j.doc.docNo}: entered by ${j.doc.enteredBy}, reviewed by ${name(j.review!.personId)}`, link: `/journals/${j.doc.key}` });
        }
        break;
      }
      case "journal-concluded": {
        const flagged = i.journals.filter((j) => j.flags.length > 0);
        for (const j of flagged) {
          if (j.review) {
            tested += 1;
            const late = day(j.review.at) > journalDeadline;
            if (late) exceptions += 1;
            ev.push({ at: j.review.at, ok: !late, text: `Journal ${j.doc.docNo} concluded ${fmtDate(day(j.review.at))}${late ? `, after ${fmtDate(journalDeadline)}` : ""}`, link: `/journals/${j.doc.key}` });
          } else if (i.today > journalDeadline) {
            tested += 1;
            exceptions += 1;
          } else pending += 1;
        }
        const open = flagged.filter((j) => !j.review).length;
        if (open > 0 && i.today > journalDeadline) ev.push({ at: journalDeadline, ok: false, text: `${open} flagged journals not concluded by ${fmtDate(journalDeadline)}`, link: "/journals?tab=review" });
        pendingOpen = i.today <= journalDeadline;
        break;
      }
      case "rule-reason": {
        for (const e of i.events.filter((x) => x.module === "rules-policies" && /^Rule (changed|enabled|disabled|added|removed)$/.test(x.action))) {
          tested += 1;
          const has = !!e.reason?.trim();
          if (!has) exceptions += 1;
          ev.push({ at: e.at, ok: has, text: `${e.object.id}: ${e.action.toLowerCase()} by ${name(e.actorId)}${has ? "" : ", no reason recorded"}`, link: `/rules?rule=${e.object.id}` });
        }
        break;
      }
    }
    out.push(result(def, tested, exceptions, pending, ev, pendingOpen));
  }
  return { controls: out, sod: sod.sort((a, b) => b.at.localeCompare(a.at)) };
}
