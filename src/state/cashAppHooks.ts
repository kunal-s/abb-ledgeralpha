// Receipt rows for Cash Application: each receipt waiting in clearing with the
// matcher's proposals, its decision, follow-up and parking applied.

import { useMemo } from "react";
import type { Decision, FollowUp } from "@/types";
import { PARTY_BY_ID } from "@/data";
import { CASH_APP_POLICY } from "@/config/policies";
import { buildCashAppData } from "@/engine/cashappData";
import { receiptAge, type CashAppData, type Match, type Proposal, type Receipt } from "@/engine/cashapp";
import { computeMatches, type CashAppWork } from "@/state/cashAppModel";
import { useDecisionsByItem, useFollowUpsByItem } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";

export type CashAppStatus = "ready" | "suggested" | "unmatched" | "parked" | "decision-proposed" | "approved" | "exported" | "closed-in-erp" | "in-follow-up";

export interface ReceiptRow {
  key: string;
  receipt: Receipt;
  match: Match;
  /** the proposal, when its confidence reaches the policy floor */
  best?: Proposal;
  /** the closest explanation below the floor, shown for context */
  weak?: Proposal;
  decision?: Decision;
  followUp?: FollowUp;
  parked?: CashAppWork["parked"];
  rejected: number;
  status: CashAppStatus;
  age: number;
  customerId?: string;
  customerName?: string;
}

export function statusOf(best: Proposal | undefined, decision?: Decision, followUp?: FollowUp, parked?: CashAppWork["parked"]): CashAppStatus {
  if (decision) {
    if (decision.status === "closed-in-erp") return "closed-in-erp";
    if (decision.status === "exported") return "exported";
    if (decision.status === "approved") return "approved";
    if (decision.status === "proposed") return "decision-proposed";
  }
  if (parked) return "parked";
  if (best) return best.confidence >= CASH_APP_POLICY.bulkConfirmFrom ? "ready" : "suggested";
  if (followUp && followUp.status !== "closed") return "in-follow-up";
  return "unmatched";
}

export function useCashApp(): { rows: ReceiptRow[]; byKey: Map<string, ReceiptRow>; data: CashAppData } {
  const decisions = useWorkflow((s) => s.decisions);
  const work = useWorkflow((s) => s.cashApp);
  const decisionByItem = useDecisionsByItem();
  const followUpByItem = useFollowUpsByItem();
  const data = useMemo(() => buildCashAppData(), []);

  return useMemo(() => {
    const matches = computeMatches(decisions, work);
    const rows: ReceiptRow[] = [];
    for (const m of matches.values()) {
      const top = m.proposals[0];
      const best = top && top.confidence >= CASH_APP_POLICY.proposeFrom ? top : undefined;
      const decision = decisionByItem.get(m.receipt.key);
      const followUp = followUpByItem.get(m.receipt.key);
      const parked = work[m.receipt.key]?.parked;
      const customerId = best?.customerId ?? (m.customers[0]?.score >= 0.9 ? m.customers[0].customerId : undefined);
      rows.push({
        key: m.receipt.key, receipt: m.receipt, match: m, best, weak: best ? undefined : top, decision, followUp, parked,
        rejected: work[m.receipt.key]?.rejected?.length ?? 0,
        status: statusOf(best, decision, followUp, parked),
        age: receiptAge(m.receipt, data.asOf),
        customerId, customerName: customerId ? PARTY_BY_ID.get(customerId)?.name : undefined,
      });
    }
    rows.sort((a, b) => b.age - a.age || b.receipt.amount - a.receipt.amount);
    return { rows, byKey: new Map(rows.map((r) => [r.key, r])), data };
  }, [decisions, work, decisionByItem, followUpByItem, data]);
}

export function useReceiptRow(key: string | undefined): ReceiptRow | undefined {
  const { byKey } = useCashApp();
  return key ? byKey.get(key) : undefined;
}
