// The review as a story: where the risk sits, what is recommended and how old
// the oldest balances are. Pure functions over the review rows, so the Overview,
// Home and the tests read the same figures (docs/FRD.md §6.6, D-48).

import type { AccountCategory, ActionKind } from "@/types";
import { GL_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { BUCKETS, type BucketId } from "@/engine/review";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import type { ItemRow } from "@/state/hooks";

/** The balance sheet areas that take most manual effort, in the order a reviewer thinks of them. */
export const FOCUS_CATEGORIES: AccountCategory[] = ["grir", "vendor-adv", "customer-adv", "unbilled", "retention", "tds-recv", "suspense"];

export const STALE_DAYS = 365;

const abs = (r: ItemRow) => Math.abs(r.item.amount);
const live = (rows: ItemRow[]) => rows.filter((r) => r.flagged && r.isOpen);

export interface FocusArea {
  category: AccountCategory;
  label: string;
  count: number;
  value: number;
  byBucket: Record<BucketId, { count: number; amount: number }>;
  oldest: number;
  /** the action recommended for most of the value */
  mainAction?: ActionKind;
}

const emptyBuckets = () => Object.fromEntries(BUCKETS.map((b) => [b.id, { count: 0, amount: 0 }])) as FocusArea["byBucket"];

/** Flagged open value for each focus category, split by ageing bucket. */
export function focusAreas(rows: ItemRow[]): FocusArea[] {
  return FOCUS_CATEGORIES.map((category) => {
    const mine = live(rows).filter((r) => r.category === category);
    const byBucket = emptyBuckets();
    const byAction = new Map<ActionKind, number>();
    for (const r of mine) {
      byBucket[r.bucket].count += 1;
      byBucket[r.bucket].amount += abs(r);
      if (r.rec) byAction.set(r.rec.action, (byAction.get(r.rec.action) ?? 0) + abs(r));
    }
    const mainAction = [...byAction.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    return {
      category,
      label: CATEGORY_LABELS[category],
      count: mine.length,
      value: mine.reduce((s, r) => s + abs(r), 0),
      byBucket,
      oldest: mine.reduce((m, r) => Math.max(m, r.age), 0),
      mainAction,
    };
  });
}

export interface ActionSlice {
  action: ActionKind | "No recommendation";
  count: number;
  value: number;
}

const ACTION_ORDER: (ActionKind | "No recommendation")[] = ["Write back", "Write off", "Provide", "Clear", "Reclassify", "Escalate", "Follow up", "No recommendation"];

/** What the engine recommends across the flagged open items, by action. */
export function actionMix(rows: ItemRow[]): ActionSlice[] {
  const map = new Map<ActionSlice["action"], ActionSlice>();
  for (const r of live(rows)) {
    const k = r.rec?.action ?? "No recommendation";
    const s = map.get(k) ?? { action: k, count: 0, value: 0 };
    s.count += 1;
    s.value += abs(r);
    map.set(k, s);
  }
  return ACTION_ORDER.map((a) => map.get(a)).filter((s): s is ActionSlice => !!s);
}

export interface StaleAccount {
  gl: string;
  name: string;
  category: AccountCategory;
  amount: number;
  count: number;
  oldest: number;
  action?: ActionKind;
}

/** Accounts holding flagged balances older than `minAge` days, largest value first. Only the old items are counted. */
export function staleBalances(rows: ItemRow[], minAge = STALE_DAYS): StaleAccount[] {
  const per = new Map<string, StaleAccount & { top: number }>();
  for (const r of live(rows)) {
    if (r.age <= minAge) continue;
    const g = GL_BY_ID.get(r.item.gl);
    const s = per.get(r.item.gl) ?? { gl: r.item.gl, name: g?.description ?? r.item.gl, category: r.category, amount: 0, count: 0, oldest: 0, top: 0 };
    s.amount += abs(r);
    s.count += 1;
    s.oldest = Math.max(s.oldest, r.age);
    if (abs(r) > s.top) {
      s.top = abs(r);
      s.action = r.rec?.action;
    }
    per.set(r.item.gl, s);
  }
  return [...per.values()].sort((a, b) => b.amount - a.amount).map(({ top: _top, ...s }) => s);
}

export interface PortfolioFacts {
  openValue: number;
  flaggedValue: number;
  flaggedCount: number;
  staleValue: number;
  staleCount: number;
  focus: FocusArea[];
  mix: ActionSlice[];
  stale: StaleAccount[];
  signed: number;
  accounts: number;
}

export function portfolioFacts(rows: ItemRow[], accounts: { signed: number; total: number }): PortfolioFacts {
  const flagged = live(rows);
  const stale = staleBalances(rows);
  return {
    openValue: rows.filter((r) => r.isOpen).reduce((s, r) => s + abs(r), 0),
    flaggedValue: flagged.reduce((s, r) => s + abs(r), 0),
    flaggedCount: flagged.length,
    staleValue: stale.reduce((s, a) => s + a.amount, 0),
    staleCount: stale.reduce((s, a) => s + a.count, 0),
    focus: focusAreas(rows),
    mix: actionMix(rows),
    stale,
    signed: accounts.signed,
    accounts: accounts.total,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

/** A short reading of the whole balance sheet, drafted from the facts (decision D-04: a template, not a live model). */
export function draftPortfolioCommentary(f: PortfolioFacts): string {
  const parts: string[] = [];
  parts.push(`${fmtINRCompact(f.flaggedValue)} of ${fmtINRCompact(f.openValue)} open is flagged across ${plural(f.flaggedCount, "item")}.`);
  const top = [...f.focus].filter((a) => a.value > 0).sort((a, b) => b.value - a.value)[0];
  if (top) parts.push(`${top.label} carries the most, ${fmtINRCompact(top.value)} across ${plural(top.count, "item")}, the oldest ${fmtInt(top.oldest)} days.`);
  if (f.staleCount) {
    const lead = f.stale[0];
    parts.push(`${fmtINRCompact(f.staleValue)} across ${plural(f.staleCount, "item")} is older than a year, most of it on ${lead.name.toLowerCase()} (${fmtINRCompact(lead.amount)}).`);
  } else {
    parts.push("Nothing flagged is older than a year.");
  }
  const rec = (a: ActionSlice["action"]) => f.mix.find((m) => m.action === a);
  const bits: string[] = [];
  for (const [a, text] of [["Write back", "write-back"], ["Write off", "write-off"], ["Provide", "provision"], ["Clear", "clearing"], ["Reclassify", "reclassification"], ["Escalate", "escalation"]] as const) {
    const s = rec(a);
    if (s) bits.push(`${fmtINRCompact(s.value)} for ${text}`);
  }
  if (bits.length) parts.push(`Recommended: ${bits.join(", ")}.`);
  const fu = rec("Follow up");
  if (fu) parts.push(`${plural(fu.count, "item")} (${fmtINRCompact(fu.value)}) need evidence before an action can be proposed.`);
  parts.push(`${fmtInt(f.signed)} of ${fmtInt(f.accounts)} accounts are signed off.`);
  return parts.join(" ");
}

// ---------------------------------------------------------------------------
// One item's own history: what happened to it and around it, in date order
// ---------------------------------------------------------------------------
export interface TimelineEvent {
  date: string;
  label: string;
  detail?: string;
  kind: "document" | "activity" | "review" | "asat";
}

export function itemTimeline(row: ItemRow, asOf: string): TimelineEvent[] {
  const ev: TimelineEvent[] = [];
  const it = row.item;
  ev.push({ date: it.postingDate, label: `Posted as ${it.docType} ${it.docNo}`, detail: it.sourceSystem, kind: "document" });
  if (it.documentDate && it.documentDate !== it.postingDate) ev.push({ date: it.documentDate, label: "Document dated", kind: "document" });
  if (it.dueDate) ev.push({ date: it.dueDate, label: "Due", kind: "document" });
  const po = it.po ? WORLD.purchaseOrders.find((p) => p.po === it.po!.number && p.item === it.po!.item) : undefined;
  if (po?.lastGrDate) ev.push({ date: po.lastGrDate, label: "Last goods receipt", detail: `PO ${po.po}`, kind: "activity" });
  if (po?.lastInvoiceDate) ev.push({ date: po.lastInvoiceDate, label: "Last invoice", detail: `PO ${po.po}`, kind: "activity" });
  const project = it.wbs ? PROJECT_BY_WBS.get(it.wbs) : undefined;
  if (project?.dlpEnd) ev.push({ date: project.dlpEnd, label: "Defect liability period ends", detail: project.name, kind: "activity" });
  const facts = Object.assign({}, ...row.hits.map((h) => h.facts)) as Record<string, string | number | boolean>;
  const bg = facts.bgNo ? WORLD.bankGuarantees.find((b) => b.bgNo === facts.bgNo) : undefined;
  if (bg) ev.push({ date: bg.validTo, label: "Bank guarantee valid to", detail: bg.bgNo, kind: "activity" });
  if (row.followUp) ev.push({ date: row.followUp.createdAt.slice(0, 10), label: "Follow-up requested", detail: `To ${row.followUp.owner}`, kind: "review" });
  if (row.followUp?.response) ev.push({ date: row.followUp.response.at.slice(0, 10), label: "Follow-up answered", kind: "review" });
  if (row.decision) ev.push({ date: row.decision.proposedAt.slice(0, 10), label: `${row.decision.action} proposed`, detail: `Band ${row.decision.approvalBandId}`, kind: "review" });
  ev.push({ date: asOf, label: "Review date", kind: "asat" });
  return ev.filter((e) => e.date <= asOf || e.kind !== "activity").sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "asat" ? 1 : -1));
}
