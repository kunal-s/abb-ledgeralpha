// Demo workspace configuration history: rule changes and the review work
// already done before the demo session starts. Workspace data only.

import type { AccountSignOff, JournalReview } from "@/types";
import type { RuleOverrides } from "@/engine/run";
import { BALANCES, LINE_BY_KEY, WORLD, balanceAt } from "@/data";
import { previousQuarterEnd } from "@/engine/context";
import { journalDocs, reviewJournals } from "@/engine/journalReview";
import { draftRecCommentary, effectiveRec, needsAction } from "@/engine/recs";
import { fmtDate } from "@/lib/dates";

export interface SeededRuleChange {
  at: string; // local ISO date-time
  personId: string;
  ruleId: string;
  paramKey: string;
  from: number;
  to: number;
  reason: string;
}

export const SEEDED_RULE_CHANGES: SeededRuleChange[] = [
  {
    at: "2026-08-14T11:42",
    personId: "P01",
    ruleId: "BSR-10",
    paramKey: "ageDays",
    from: 45,
    to: 30,
    reason: "Tighter ageing on suspense and clearing after the Q2 audit observation on unidentified receipts",
  },
];

/** The workspace's rule overrides as at the start of the demo session. */
export const SEEDED_RULE_OVERRIDES: RuleOverrides = SEEDED_RULE_CHANGES.reduce<RuleOverrides>((acc, c) => {
  acc[c.ruleId] = { ...acc[c.ruleId], params: { ...(acc[c.ruleId]?.params ?? {}), [c.paramKey]: c.to } };
  return acc;
}, {});

/**
 * Reconciliations the preparers finished in the first days of the cycle: those
 * that agree to their source with nothing left to act on. The rest are left for
 * the demo session.
 */
function seededRecSignOffs(): Record<string, AccountSignOff> {
  const out: Record<string, AccountSignOff> = {};
  const done = WORLD.reconciliations.filter((r) => {
    const v = effectiveRec(r, undefined, WORLD.asOf);
    return v.prepared && v.sourceBalance !== null && v.unclassified === 0 && v.withinTolerance && !v.items.some(needsAction) && r.confirmation?.status !== "reply-received";
  });
  done.forEach((r, i) => {
    const mode = i % 5; // 0-2 signed off, 3 preparer only, 4 left open
    if (mode === 4) return;
    const v = effectiveRec(r, undefined, WORLD.asOf);
    // counterparty reconciliations are signed after the reply came in
    const replyDay = r.confirmation?.repliedAt?.slice(0, 10);
    const minute = String((i * 7) % 60).padStart(2, "0");
    const preparerAt = replyDay ? `${replyDay}T16:${minute}` : `2026-10-0${2 + (i % 3)}T${String(10 + (i % 6)).padStart(2, "0")}:${minute}`;
    const reviewerAt = replyDay ? `${replyDay}T17:${minute}` : `2026-10-05T${String(14 + (i % 4)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}`;
    const so: AccountSignOff = { gl: r.id, periodEnd: WORLD.asOf, preparer: { personId: r.preparerId, at: preparerAt } };
    if (v.items.length > 0) {
      so.commentary = draftRecCommentary(v, WORLD.asOf);
      so.commentaryEdited = false;
    }
    if (mode <= 2) so.reviewer = { personId: r.reviewerId, at: reviewerAt };
    out[`${r.id}|${WORLD.asOf}`] = so;
  });
  return out;
}

/** Scenarios whose journals the demo leaves for the session: they are what the reviewer is meant to find. */
const OPEN_JOURNAL_SCENARIOS = ["S-12", "S-14", "S-15"];

const SEEDED_JOURNAL_NOTES: Record<string, string> = {
  "JNL-01": "Amount agrees to the signed contract schedule; the round figure is the agreed provision rate",
  "JNL-02": "Entered during the month-end close window; supporting workings checked to the ledger",
  "JNL-03": "Late entry for the period; the posting agrees to the approved close checklist",
  "JNL-04": "Account pair is correct for this transaction; mapping checked with the account owner",
  "JNL-05": "Account used for the first time this year; the posting agrees to the supporting advice",
};

/**
 * The journal reviewer's conclusions on the quarter's flagged journals as at
 * the start of the demo session: most of those posted before the last week are
 * accepted; the recent ones and the scenario journals are left open.
 */
export function seededJournalReviews(): Record<string, JournalReview> {
  const asOf = WORLD.asOf;
  const docs = journalDocs(previousQuarterEnd(asOf), asOf);
  const flags = reviewJournals(docs, asOf);
  const kept = new Set<string>();
  for (const id of OPEN_JOURNAL_SCENARIOS) {
    for (const k of WORLD.anchors[id] ?? []) {
      const l = LINE_BY_KEY.get(k);
      if (l) kept.add(`${l.fiscalYear}-${l.docNo}`);
    }
  }
  const out: Record<string, JournalReview> = {};
  let i = 0;
  for (const d of docs) {
    const f = flags.get(d.key);
    if (!f || kept.has(d.key) || d.postingDate > "2026-09-24" || d.entryDate > "2026-10-02") continue;
    i += 1;
    if (i % 4 === 0) continue;
    const reviewer = d.enteredBy === "MIYER" ? "P13" : "P01";
    out[d.key] = {
      docKey: d.key,
      outcome: "accepted",
      note: SEEDED_JOURNAL_NOTES[f[0].checkId] ?? "Supporting documents checked",
      personId: reviewer,
      at: `2026-10-0${3 + (i % 3)}T${String(10 + (i % 7)).padStart(2, "0")}:${String((i * 13) % 60).padStart(2, "0")}`,
    };
  }
  return out;
}

/**
 * Review work done in the first days of the quarter's review: balance-only
 * accounts (reviewed against supporting schedules) the owners have prepared
 * and the controller has signed off. Open-item accounts are left for the demo
 * - their sign-off depends on decisions that happen in the session.
 */
export function seededSignOffs(): Record<string, AccountSignOff> {
  const out: Record<string, AccountSignOff> = { ...seededRecSignOffs() };
  // an account that has a reconciliation is reviewed through it: it is not signed before the reconciliation is
  const unsignedRec = (gl: string) => WORLD.reconciliations.some((r) => r.gl === gl && !out[`${r.id}|${WORLD.asOf}`]?.reviewer);
  const accounts = WORLD.glAccounts.filter((g) => g.category !== "pl" && !g.openItemManaged && !unsignedRec(g.gl) && Math.abs(balanceAt(BALANCES, g.gl, WORLD.asOf)?.closing ?? 0) > 0);
  accounts.forEach((g, i) => {
    const mode = i % 5; // 0–2 signed off · 3 preparer only · 4 not started
    if (mode === 4) return;
    const day = 2 + (i % 2);
    const so: AccountSignOff = {
      gl: g.gl,
      periodEnd: WORLD.asOf,
      commentary: `${g.description} agrees to the supporting schedule at ${fmtDate(WORLD.asOf)}; no reconciling items outstanding.`,
      // one owner in four had reworded the narrator's draft
      commentaryEdited: i % 4 === 0,
      preparer: { personId: g.ownerId, at: `2026-10-0${day}T${String(10 + (i % 6)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}` },
    };
    if (mode <= 2) so.reviewer = { personId: g.reviewerId, at: `2026-10-05T${String(14 + (i % 4)).padStart(2, "0")}:${String((i * 11) % 60).padStart(2, "0")}` };
    out[`${g.gl}|${WORLD.asOf}`] = so;
  });
  return out;
}
