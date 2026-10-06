// Reconciliation engine (docs/FRD.md §6.7). A reconciliation compares the
// books with a source; the difference is explained by classified reconciling
// items. Unexplained = (books - source) - sum of the effects of the classified
// items, and a reconciliation cannot be signed off while it is outside the
// tolerance for its type. Pure functions over the reconciliation and the
// session's work on it.

import type {
  AccountReviewStatus, AccountSignOff, ConfirmationStatus, Decision, FollowUp, JournalSpec, ReconClass, ReconItem, Reconciliation,
} from "@/types";
import { RECON_POLICY } from "@/config/policies";
import { reconClass } from "@/engine/recClasses";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtDrCr, fmtINR, fmtInt } from "@/lib/format";

/** The session's changes to a reconciliation (kept in the workflow store). */
export interface RecWork {
  prepared?: boolean;
  /** a reply applied by the agent or a person */
  source?: { balance: number; at: string; by: string };
  confirmation?: { status: ConfirmationStatus; sentAt?: string; repliedAt?: string };
  /** items added by the agent's diagnosis or by a person */
  items: ReconItem[];
  /** classification overrides: item id -> class id */
  classes: Record<string, string>;
}

export interface EffItem extends ReconItem {
  classId?: string;
  cls?: ReconClass;
  /** contribution to (books - source) */
  effect: number;
  /** days between the item's date and the period end */
  ageDays: number;
}

export interface RecView {
  rec: Reconciliation;
  work?: RecWork;
  items: EffItem[];
  prepared: boolean;
  sourceBalance: number | null;
  difference: number | null;
  explained: number;
  unexplained: number | null;
  unclassified: number;
  withinTolerance: boolean;
  agedItems: number;
  confirmation?: { status: ConfirmationStatus; sentAt?: string; repliedAt?: string; contact: string };
}

export const effectOf = (i: Pick<ReconItem, "side" | "amount">) => (i.side === "books" ? i.amount : -i.amount);

export function effectiveRec(rec: Reconciliation, work: RecWork | undefined, asOf: string): RecView {
  const prepared = work?.prepared ?? rec.seedPrepared;
  const all = [...rec.items, ...(work?.items ?? [])];
  const items: EffItem[] = all.map((i) => {
    const classId = work?.classes[i.id] ?? (prepared || i.origin === "agent" ? i.suggestedClass : undefined);
    return { ...i, classId, cls: reconClass(classId), effect: effectOf(i), ageDays: Math.max(0, daysBetween(i.date, asOf)) };
  });
  const sourceBalance = work?.source?.balance ?? rec.sourceBalance;
  const difference = sourceBalance === null ? null : rec.booksBalance - sourceBalance;
  const explained = items.filter((i) => i.cls).reduce((s, i) => s + i.effect, 0);
  const unexplained = difference === null ? null : difference - explained;
  const confirmation = rec.confirmation ? { ...rec.confirmation, ...(work?.confirmation ?? {}) } : undefined;
  return {
    rec,
    work,
    items,
    prepared,
    sourceBalance,
    difference,
    explained,
    unexplained,
    unclassified: items.filter((i) => !i.cls).length,
    withinTolerance: unexplained !== null && Math.abs(unexplained) <= RECON_POLICY.tolerance[rec.type],
    agedItems: items.filter((i) => i.cls && i.cls.treatment !== "classification" && i.ageDays > RECON_POLICY.agedItemDays).length,
    confirmation,
  };
}

// ---------------------------------------------------------------------------
// Keys: a reconciling item is addressed as `${reconciliationId}::${itemId}` so
// decisions, follow-ups and activity can refer to it like a ledger line.
// ---------------------------------------------------------------------------
const KEY_SEP = "::";
export const recItemKey = (recId: string, itemId: string) => `${recId}${KEY_SEP}${itemId}`;
export const isRecItemKey = (key: string) => key.startsWith("REC-") && key.includes(KEY_SEP);
export function parseRecItemKey(key: string): { recId: string; itemId: string } | undefined {
  if (!isRecItemKey(key)) return undefined;
  const at = key.indexOf(KEY_SEP);
  return { recId: key.slice(0, at), itemId: key.slice(at + KEY_SEP.length) };
}

/** Treatments that need somebody to act: an entry, a correction at the source, a dispute or an explanation. */
const ACTION_TREATMENTS = new Set<ReconClass["treatment"]>(["adjust-books", "adjust-source", "dispute", "investigate"]);
export const needsAction = (i: EffItem) => !!i.cls && ACTION_TREATMENTS.has(i.cls.treatment);

/** Item ids of a reconciliation that have a live decision or an open follow-up. */
export function documentedItems(recId: string, decisions: Decision[], followUps: FollowUp[]): Set<string> {
  const out = new Set<string>();
  const live = new Set(["proposed", "approved", "exported", "closed-in-erp"]);
  for (const d of decisions) {
    const p = parseRecItemKey(d.itemKey);
    if (p?.recId === recId && live.has(d.status)) out.add(p.itemId);
  }
  for (const f of followUps) {
    const p = parseRecItemKey(f.itemKey);
    if (p?.recId === recId && f.status !== "closed") out.add(p.itemId);
  }
  return out;
}

/** Why a reconciliation cannot be signed off yet, in plain words. */
export function signOffBlockers(v: RecView, hasCommentary: boolean, documented: ReadonlySet<string> = new Set()): string[] {
  const out: string[] = [];
  if (!v.prepared) out.push("Not yet prepared");
  if (v.sourceBalance === null) out.push("Waiting for the counterparty's balance");
  if (v.unclassified > 0) out.push(`${fmtInt(v.unclassified)} reconciling item${v.unclassified === 1 ? "" : "s"} not classified`);
  if (v.unexplained !== null && !v.withinTolerance) out.push(`Unexplained difference ${fmtDrCr(v.unexplained)}`);
  const undocumented = v.items.filter((i) => needsAction(i) && !documented.has(i.id)).length;
  if (undocumented > 0) out.push(`${fmtInt(undocumented)} item${undocumented === 1 ? "" : "s"} without a decision or follow-up`);
  if (v.items.length > 0 && !hasCommentary) out.push("Commentary not saved");
  return out;
}

export function recStatus(v: RecView, signOff: AccountSignOff | undefined, hasCommentary: boolean, documented: ReadonlySet<string> = new Set()): AccountReviewStatus {
  if (signOff?.reviewer) return "reviewer-signed";
  if (signOff?.preparer) return "preparer-signed";
  if (signOff?.reopened) return "reopened";
  if (signOffBlockers(v, hasCommentary, documented).length === 0) return "ready-for-signoff";
  const touched = v.prepared || (v.work?.items.length ?? 0) > 0 || Object.keys(v.work?.classes ?? {}).length > 0 || hasCommentary || documented.size > 0;
  return touched ? "in-review" : "not-started";
}

// ---------------------------------------------------------------------------
// Journals for items that need an entry in the books
// ---------------------------------------------------------------------------
const SCHEDULE_EXPENSE: Record<string, string> = {
  "231100": "531200",
  "231200": "531300",
  "231300": "531900",
  "231400": "520300",
  "231500": "520300",
  "232100": "530300",
  "232200": "530600",
  "241700": "520200",
  "261100": "520100",
};

export function adjustmentJournal(rec: Reconciliation, item: ReconItem, classId: string): JournalSpec | undefined {
  const abs = Math.abs(item.amount);
  const gl = rec.gl ?? "";
  const ref = item.reference ? ` ${item.reference}` : "";
  const mk = (header: string, lines: JournalSpec["lines"], needsTarget = false): JournalSpec => ({ header, lines, needsTarget });
  switch (classId) {
    case "bank-charges":
      return mk(`Bank charges${ref}`, [{ gl: "531100", side: "Dr", amount: abs, text: item.narration }, { gl, side: "Cr", amount: abs, text: item.narration }]);
    case "bank-interest":
      return mk(`Interest credited by the bank${ref}`, [{ gl, side: "Dr", amount: abs, text: item.narration }, { gl: "461100", side: "Cr", amount: abs, text: item.narration }]);
    case "unidentified-receipt":
      return mk(`Unidentified receipt parked in clearing${ref}`, [{ gl, side: "Dr", amount: abs, text: item.narration }, { gl: "171200", side: "Cr", amount: abs, text: `${item.narration} (to be matched in Cash Application)` }]);
    case "direct-posting":
      return mk(`Assign direct posting to a partner account${ref}`, [{ gl, side: item.amount > 0 ? "Dr" : "Cr", amount: abs, text: "Post to the business partner's account (partner to be confirmed)" }, { gl, side: item.amount > 0 ? "Cr" : "Dr", amount: abs, text: "Reverse from the control account" }], true);
    case "journal-not-posted": {
      const expense = SCHEDULE_EXPENSE[gl] ?? "";
      const debitsAccount = item.amount > 0;
      return mk(`Post schedule movement to ${gl}`, [
        { gl: debitsAccount ? gl : expense, side: "Dr", amount: abs, text: item.narration },
        { gl: debitsAccount ? expense : gl, side: "Cr", amount: abs, text: item.narration },
      ], !expense);
    }
    case "challan-not-booked":
      return mk(`Tax deposit not booked${ref}`, [{ gl, side: "Dr", amount: abs, text: item.narration }, { gl: "181300", side: "Cr", amount: abs, text: item.narration }]);
    case "ic-fx": {
      const account = rec.booksBalance >= 0 ? "164100" : "251100";
      const gain = item.amount > 0;
      return mk(`FX revaluation of group balance`, [
        { gl: gain ? account : "531700", side: "Dr", amount: abs, text: item.narration },
        { gl: gain ? "462100" : account, side: "Cr", amount: abs, text: item.narration },
      ]);
    }
    case "ic-missing-booking":
      return mk(`Group charge not yet recorded${ref}`, [{ gl: "530900", side: "Dr", amount: abs, text: item.narration }, { gl: "251100", side: "Cr", amount: abs, text: item.narration }], true);
    case "tds-not-recognised":
      return mk(`Tax deducted by customer${ref}`, [{ gl: "161100", side: "Dr", amount: abs, text: item.narration }, { gl: "140100", side: "Cr", amount: abs, text: item.narration }]);
    case "vendor-invoice-not-booked":
      return mk(`Vendor invoice not yet recorded${ref}`, [{ gl: "", side: "Dr", amount: abs, text: `${item.narration} (expense account to be confirmed)` }, { gl: "210100", side: "Cr", amount: abs, text: item.narration }], true);
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Drafted text
// ---------------------------------------------------------------------------
export function draftRecCommentary(v: RecView, asOf: string): string {
  const r = v.rec;
  const parts: string[] = [];
  parts.push(`${r.name} at ${fmtDate(asOf)}: ${r.booksLabel.toLowerCase()} ${fmtDrCr(r.booksBalance)}${v.sourceBalance === null ? "." : `, ${r.sourceLabel.toLowerCase()} ${fmtDrCr(v.sourceBalance)}, difference ${fmtDrCr(v.difference!)}.`}`);
  if (v.sourceBalance === null) return `${parts.join(" ")} Waiting for the counterparty's reply.`;
  if (v.items.length === 0) {
    parts.push(v.difference === 0 ? "The balances agree with no reconciling items." : "No reconciling items have been identified yet.");
    return parts.join(" ");
  }
  const by = new Map<string, { n: number; v: number; treatment: string }>();
  for (const i of v.items) {
    if (!i.cls) continue;
    const e = by.get(i.cls.label) ?? { n: 0, v: 0, treatment: i.cls.treatment };
    e.n += 1;
    e.v += Math.abs(i.amount);
    by.set(i.cls.label, e);
  }
  const bits = [...by.entries()].map(([label, e]) => `${label.toLowerCase()}: ${fmtINR(e.v)} (${e.n})`);
  if (bits.length) parts.push(`Explained by ${bits.join("; ")}.`);
  const adjust = v.items.filter((i) => i.cls?.treatment === "adjust-books").length;
  const dispute = v.items.filter((i) => i.cls?.treatment === "dispute").length;
  if (adjust) parts.push(`${fmtInt(adjust)} need${adjust === 1 ? "s" : ""} an entry in the books.`);
  if (dispute) parts.push(`${fmtInt(dispute)} disputed and routed to the project owner.`);
  parts.push(v.unexplained === 0 ? "No unexplained difference." : `Unexplained difference ${fmtINR(Math.abs(v.unexplained ?? 0))}.`);
  return parts.join(" ");
}

export function draftRecFollowUp(rec: Reconciliation, item: ReconItem, classId: string | undefined): { owner: string; message: string } {
  const amount = fmtINR(Math.abs(item.amount));
  const where = `${rec.name} at ${fmtDate(item.date)}`;
  switch (classId) {
    case "unidentified-receipt":
      return { owner: "Bank relationship manager", message: `Please share the remitter details for the credit of ${amount} on ${fmtDate(item.date)} (${item.narration}) so it can be matched to a customer.` };
    case "bank-error":
      return { owner: "Bank relationship manager", message: `The statement shows ${amount} dated ${fmtDate(item.date)} that we believe is an error. Please review and correct.` };
    case "disputed-deduction":
      return { owner: "Project manager and commercial owner", message: `The customer has deducted ${amount} that we do not accept (${item.narration}). Please confirm the contractual position and let us have the support to respond.` };
    case "customer-error":
      return { owner: "Customer accounts payable", message: `Please review ${amount} in your statement dated ${fmtDate(item.date)} and correct your record.` };
    case "credit-note-pending":
      return { owner: "Vendor accounts receivable", message: `Please issue the credit note of ${amount} agreed on ${fmtDate(item.date)} so our balances agree.` };
    case "schedule-not-updated":
      return { owner: "Schedule owner", message: `The books moved by ${amount} that is not yet in the supporting schedule (${item.narration}). Please update the schedule.` };
    case "ic-counterparty-error":
      return { owner: "Group company finance", message: `Please review ${amount} in your confirmation for ${where} and correct your record.` };
    default:
      return { owner: "Account owner", message: `Please explain ${amount} on ${where}: ${item.narration}.` };
  }
}
