// Journal rows: the journals posted in the period, the journal reviewer's flags
// on the manual ones, and the reviewer's conclusion and follow-up applied.

import { useMemo } from "react";
import type { Decision, FollowUp, IsoDate, JournalReview } from "@/types";
import { usePeriodStore, useScopeStore } from "@/lib/stores";
import { previousQuarterEnd } from "@/engine/context";
import { buildProposal } from "@/engine/journals";
import { journalDocs, reviewJournals, severityOf, type JournalDoc, type JournalFlag } from "@/engine/journalReview";
import { inScope } from "@/engine/review";
import { useFollowUpsByItem } from "@/state/hooks";
import { useWorkflow } from "@/state/workflow";

/** What the reviewer needs to do with a journal. */
export type JournalStatus = "system" | "within-policy" | "flagged" | "support-requested" | "accepted";

export interface JournalRow {
  doc: JournalDoc;
  flags: JournalFlag[];
  severity?: "low" | "medium" | "high";
  review?: JournalReview;
  followUp?: FollowUp;
  status: JournalStatus;
}

export interface JournalsModel {
  from: IsoDate;
  asOf: IsoDate;
  rows: JournalRow[];
  byKey: Map<string, JournalRow>;
  /** manual journals the checks flagged, whatever their status */
  flagged: JournalRow[];
  manual: number;
}

export function useJournals(): JournalsModel {
  const asOf = usePeriodStore((s) => s.periodEnd);
  const businessUnitId = useScopeStore((s) => s.businessUnitId);
  const reviews = useWorkflow((s) => s.journalReviews);
  const followUps = useFollowUpsByItem();

  const base = useMemo(() => {
    const from = previousQuarterEnd(asOf);
    const docs = journalDocs(from, asOf).filter((d) => d.lines.some((l) => inScope(l, businessUnitId)));
    return { from, docs, flags: reviewJournals(docs, asOf) };
  }, [asOf, businessUnitId]);

  return useMemo(() => {
    const rows = base.docs.map((doc): JournalRow => {
      const flags = base.flags.get(doc.key) ?? [];
      const review = reviews[doc.key];
      const followUp = followUps.get(doc.key);
      const status: JournalStatus = !doc.manual ? "system" : flags.length === 0 ? "within-policy" : review ? review.outcome : "flagged";
      return { doc, flags, severity: flags.length ? severityOf(flags) : undefined, review, followUp, status };
    });
    return { from: base.from, asOf, rows, byKey: new Map(rows.map((r) => [r.doc.key, r])), flagged: rows.filter((r) => r.flags.length > 0), manual: rows.filter((r) => r.doc.manual).length };
  }, [base, reviews, followUps, asOf]);
}

export function useJournalRow(key: string | undefined): JournalRow | undefined {
  const { byKey } = useJournals();
  return key ? byKey.get(key) : undefined;
}

/** Decisions from any module that propose a journal, newest first. */
export function proposalDecisions(decisions: Record<string, Decision>): Decision[] {
  return Object.values(decisions)
    .filter((d) => d.status !== "withdrawn" && buildProposal(d))
    .sort((a, b) => b.proposedAt.localeCompare(a.proposedAt));
}

export function useProposalDecisions(): Decision[] {
  const decisions = useWorkflow((s) => s.decisions);
  return useMemo(() => proposalDecisions(decisions), [decisions]);
}

/** Whether a flagged journal still waits for the reviewer. */
export const isOpenFlag = (r: JournalRow) => r.status === "flagged" || r.status === "support-requested";
