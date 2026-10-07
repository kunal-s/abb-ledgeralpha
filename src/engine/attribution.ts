// Which business unit a record belongs to, for the views that cut the close by
// business unit. A line belongs to the unit of its profit centre; a
// counterparty, to the unit its postings mostly sit in; what has no unit
// (bank, tax, group, control accounts) to corporate.

import type { Reconciliation } from "@/types";
import { PC_BY_ID, WORLD } from "@/data";
import type { JournalDoc } from "@/engine/journalReview";

export const CORPORATE = "CORP";

export const buOfProfitCentre = (pcId: string): string => PC_BY_ID.get(pcId)?.businessUnitId ?? CORPORATE;

let partyUnits: Map<string, string> | undefined;

/** The unit most of a counterparty's postings are in. */
export function buOfParty(partyId?: string): string {
  if (!partyId) return CORPORATE;
  if (!partyUnits) {
    const counts = new Map<string, Map<string, number>>();
    for (const l of WORLD.lines) {
      if (!l.partner) continue;
      const bu = buOfProfitCentre(l.profitCentre);
      if (bu === CORPORATE) continue;
      const m = counts.get(l.partner.id) ?? new Map<string, number>();
      m.set(bu, (m.get(bu) ?? 0) + 1);
      counts.set(l.partner.id, m);
    }
    partyUnits = new Map();
    for (const [id, m] of counts) partyUnits.set(id, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
  }
  return partyUnits.get(partyId) ?? CORPORATE;
}

/** Statements follow their counterparty; every other reconciliation is of a company-level account. */
export function buOfRec(rec: Reconciliation): string {
  return rec.type === "Customer statement" || rec.type === "Vendor statement" ? buOfParty(rec.partyId) : CORPORATE;
}

/** The unit of the largest line that has one; corporate when none does. */
export function buOfJournal(doc: JournalDoc): string {
  let best: { bu: string; amount: number } | undefined;
  for (const l of doc.lines) {
    const bu = buOfProfitCentre(l.profitCentre);
    if (bu === CORPORATE) continue;
    if (!best || Math.abs(l.amount) > best.amount) best = { bu, amount: Math.abs(l.amount) };
  }
  return best?.bu ?? CORPORATE;
}
