// Reconciliation rows: each reconciliation with the session's work, decisions,
// follow-ups and sign-off applied. Reconciliations exist for the loaded period.

import { useMemo } from "react";
import type { AccountReviewStatus, AccountSignOff, Decision, FollowUp, Reconciliation } from "@/types";
import { WORLD } from "@/data";
import { useWorkflow } from "@/state/workflow";
import { documentedItems, effectiveRec, needsAction, parseRecItemKey, recStatus, signOffBlockers, type RecView, type RecWork } from "@/engine/recs";

export interface RecRow {
  rec: Reconciliation;
  view: RecView;
  signOff?: AccountSignOff;
  hasCommentary: boolean;
  /** item ids with a live decision or an open follow-up */
  documented: Set<string>;
  blockers: string[];
  status: AccountReviewStatus;
  /** latest non-withdrawn decision per item id */
  decisionByItem: Map<string, Decision>;
  followUpByItem: Map<string, FollowUp>;
  /** items that need action and have none yet */
  undocumented: number;
}

export interface RecRowsInput {
  recs: Record<string, RecWork>;
  signOffs: Record<string, AccountSignOff>;
  decisions: Record<string, Decision>;
  followUps: Record<string, FollowUp>;
}

/** The reconciliation rows as a pure function of the workflow state; `useRecRows` memoises it, tests call it directly. */
export function buildRecRows({ recs, signOffs, decisions, followUps }: RecRowsInput): RecRow[] {
  const decisionsByRec = new Map<string, Decision[]>();
  // decisions taken in Cash Application document the reconciling items that wait for the receipt to be applied
  const receiptDecisions = Object.values(decisions).filter((d) => d.module === "cash-application");
  for (const d of Object.values(decisions)) {
    const p = parseRecItemKey(d.itemKey);
    if (!p) continue;
    const list = decisionsByRec.get(p.recId) ?? [];
    list.push(d);
    decisionsByRec.set(p.recId, list);
  }
  const followUpsByRec = new Map<string, FollowUp[]>();
  for (const f of Object.values(followUps)) {
    const p = parseRecItemKey(f.itemKey);
    if (!p) continue;
    const list = followUpsByRec.get(p.recId) ?? [];
    list.push(f);
    followUpsByRec.set(p.recId, list);
  }

  return WORLD.reconciliations.map((rec): RecRow => {
    const view = effectiveRec(rec, recs[rec.id], WORLD.asOf);
    const signOff = signOffs[`${rec.id}|${WORLD.asOf}`];
    const hasCommentary = !!signOff?.commentary?.trim();
    const ds = decisionsByRec.get(rec.id) ?? [];
    const fs = followUpsByRec.get(rec.id) ?? [];
    const documented = documentedItems(rec.id, [...ds, ...receiptDecisions], fs, view.items);

    const decisionByItem = new Map<string, Decision>();
    for (const d of ds) {
      if (d.status === "withdrawn") continue;
      const id = parseRecItemKey(d.itemKey)!.itemId;
      const cur = decisionByItem.get(id);
      if (!cur || d.proposedAt >= cur.proposedAt) decisionByItem.set(id, d);
    }
    // an item that waits for a receipt to be applied shows the application proposed in Cash Application
    for (const i of view.items) {
      if (!i.lineKey || decisionByItem.has(i.id)) continue;
      const d = receiptDecisions.filter((x) => x.itemKey === i.lineKey && x.status !== "withdrawn").sort((a, b) => b.proposedAt.localeCompare(a.proposedAt))[0];
      if (d) decisionByItem.set(i.id, d);
    }
    const followUpByItem = new Map<string, FollowUp>();
    for (const f of fs) {
      const id = parseRecItemKey(f.itemKey)!.itemId;
      const cur = followUpByItem.get(id);
      const better = !cur || (cur.status === "closed" && f.status !== "closed") || (cur.status === f.status && f.createdAt >= cur.createdAt);
      if (better) followUpByItem.set(id, f);
    }
    return {
      rec,
      view,
      signOff,
      hasCommentary,
      documented,
      blockers: signOffBlockers(view, hasCommentary, documented),
      status: recStatus(view, signOff, hasCommentary, documented),
      decisionByItem,
      followUpByItem,
      undocumented: view.items.filter((i) => needsAction(i) && !documented.has(i.id)).length,
    };
  });
}

export function useRecRows(): RecRow[] {
  const recs = useWorkflow((s) => s.recs);
  const signOffs = useWorkflow((s) => s.signOffs);
  const decisions = useWorkflow((s) => s.decisions);
  const followUps = useWorkflow((s) => s.followUps);
  return useMemo(() => buildRecRows({ recs, signOffs, decisions, followUps }), [recs, signOffs, decisions, followUps]);
}

export function useRecRow(id: string | undefined): RecRow | undefined {
  const rows = useRecRows();
  return useMemo(() => (id ? rows.find((r) => r.rec.id === id) : undefined), [rows, id]);
}
