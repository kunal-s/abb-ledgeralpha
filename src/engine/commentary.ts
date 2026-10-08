// Account commentary drafted from facts (decision D-04: template, not a live
// model). Every figure in the text comes from the inputs; nothing is invented.

import type { ActionKind, GlAccount, IsoDate } from "@/types";
import { fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtINRCompact, fmtInt } from "@/lib/format";
import { AGEING_POLICY } from "@/config/policies";

export interface CommentaryFacts {
  gl: GlAccount;
  asOf: IsoDate;
  closing: number;
  prior: number;
  priorDate: IsoDate;
  openItemManaged: boolean;
  overCount: number;
  overAmount: number;
  flaggedCount: number;
  /** recommended actions across flagged items */
  byAction: Partial<Record<ActionKind, { count: number; value: number }>>;
  decisions: { proposed: number; approved: number; exported: number };
  openFollowUps: number;
  largest?: { docNo: string; amount: number; reason: string };
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

export function draftCommentary(f: CommentaryFacts): string {
  const parts: string[] = [];
  const movement = f.closing - f.prior;
  parts.push(
    `${fmtDrCr(f.closing, true)} is carried on ${f.gl.description} at ${fmtDate(f.asOf)}, ${movement === 0 ? "unchanged" : `${movement > 0 ? "up" : "down"} ${fmtINRCompact(Math.abs(movement))}`} since ${fmtDate(f.priorDate)}.`
  );
  if (!f.openItemManaged) {
    parts.push("The account is not open-item managed; the balance is reviewed against the supporting schedule.");
    return parts.join(" ");
  }
  if (f.overCount === 0) {
    parts.push(`Nothing is older than ${AGEING_POLICY.reviewThresholdDays} days.`);
  } else {
    parts.push(`${fmtINRCompact(f.overAmount)} across ${plural(f.overCount, "item")} is older than ${AGEING_POLICY.reviewThresholdDays} days.`);
  }
  const bits: string[] = [];
  const a = f.byAction;
  if (a["Write back"]) bits.push(`${fmtINRCompact(a["Write back"].value)} (${plural(a["Write back"].count, "item")}) for write-back, subject to tax review`);
  if (a["Write off"]) bits.push(`${fmtINRCompact(a["Write off"].value)} (${plural(a["Write off"].count, "item")}) for write-off`);
  if (a.Provide) bits.push(`${fmtINRCompact(a.Provide.value)} (${plural(a.Provide.count, "item")}) for provision`);
  if (a.Clear) bits.push(`${plural(a.Clear.count, "item")} (${fmtINRCompact(a.Clear.value)}) for clearing against offsetting entries`);
  if (a.Reclassify) bits.push(`${plural(a.Reclassify.count, "item")} (${fmtINRCompact(a.Reclassify.value)}) for reclassification`);
  if (bits.length) parts.push(`Recommended: ${bits.join("; ")}.`);
  if (a.Escalate) parts.push(`${plural(a.Escalate.count, "item")} (${fmtINRCompact(a.Escalate.value)}) are large and old with no specific finding and are recommended for senior review.`);
  if (a["Follow up"]) parts.push(`${plural(a["Follow up"].count, "item")} (${fmtINRCompact(a["Follow up"].value)}) need follow-up with the owner or counterparty.`);
  const d = f.decisions;
  if (d.proposed + d.approved + d.exported > 0) {
    const s: string[] = [];
    if (d.proposed) s.push(`${plural(d.proposed, "decision")} with approvers`);
    if (d.approved) s.push(`${fmtInt(d.approved)} approved`);
    if (d.exported) s.push(d.exported === 1 ? "1 exported as a journal proposal" : `${fmtInt(d.exported)} exported as journal proposals`);
    parts.push(`${s.join("; ")}.`);
  }
  if (f.openFollowUps) parts.push(`${plural(f.openFollowUps, "follow-up")} open.`);
  if (f.largest) parts.push(`Largest flagged item: document ${f.largest.docNo}, ${fmtINRCompact(Math.abs(f.largest.amount))} - ${f.largest.reason.charAt(0).toLowerCase()}${f.largest.reason.slice(1)}.`);
  return parts.join(" ");
}
