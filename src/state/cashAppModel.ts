// The cash application model: the matcher's proposals for every receipt in
// clearing, given the session's decisions and rejections. Plain functions, so
// the workflow store and the screens read the same answer.

import type { Decision } from "@/types";
import { matchAll, type Match } from "@/engine/cashapp";
import { buildCashAppData, openReceipts } from "@/engine/cashappData";

export interface CashAppWork {
  parked?: { reason: string; by: string; at: string };
  /** invoice-set signatures a person rejected for this receipt */
  rejected?: string[];
}

export const LIVE_DECISION = ["proposed", "approved", "exported", "closed-in-erp"];

export function computeMatches(decisions: Record<string, Decision>, work: Record<string, CashAppWork>): Map<string, Match> {
  // invoices held by another receipt's live application cannot be proposed again
  const reserved = new Map<string, string>();
  for (const d of Object.values(decisions)) {
    if (d.module !== "cash-application" || !LIVE_DECISION.includes(d.status) || !d.journal?.clears) continue;
    for (const inv of d.journal.clears.slice(1)) reserved.set(inv, d.itemKey);
  }
  const rejected = new Map<string, Set<string>>();
  for (const [k, w] of Object.entries(work)) if (w.rejected?.length) rejected.set(k, new Set(w.rejected));
  return matchAll(openReceipts(), buildCashAppData(), { reserved, rejected });
}
