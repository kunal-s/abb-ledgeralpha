// The review as a story: where the risk sits, what is recommended and how old
// the oldest balances are. Pure functions over the review rows, so the Overview,
// Home and the tests read the same figures (docs/FRD.md §6.6, D-48).

import type { AccountCategory, AccountReviewStatus, AccountSignOff, ActionKind, RoleId } from "@/types";
import { GL_BY_ID, PERSON_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { BUCKETS, type BucketId } from "@/engine/review";
import { APPROVAL_BANDS, bandFor } from "@/config/policies";
import { ROLES } from "@/config/roles";
import { fmtDate } from "@/lib/dates";
import { fmtINRCompact, fmtInt } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { statusLabel } from "@/lib/status";
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
  // the item itself is often the PO's last receipt or invoice: say so once, not twice
  if (po?.lastGrDate && !(it.docType === "WE" && po.lastGrDate === it.postingDate)) ev.push({ date: po.lastGrDate, label: "Last goods receipt", detail: `PO ${po.po}`, kind: "activity" });
  if (po?.lastInvoiceDate && !(it.docType === "RE" && po.lastInvoiceDate === it.postingDate)) ev.push({ date: po.lastInvoiceDate, label: "Last invoice", detail: `PO ${po.po}`, kind: "activity" });
  const project = it.wbs ? PROJECT_BY_WBS.get(it.wbs) : undefined;
  if (project?.dlpEnd) ev.push({ date: project.dlpEnd, label: "Defect liability period ends", detail: project.name, kind: "activity" });
  const facts = Object.assign({}, ...row.hits.map((h) => h.facts)) as Record<string, string | number | boolean>;
  const bg = facts.bgNo ? WORLD.bankGuarantees.find((b) => b.bgNo === facts.bgNo) : undefined;
  if (bg) ev.push({ date: bg.validTo, label: "Bank guarantee valid to", detail: bg.bgNo, kind: "activity" });
  if (row.followUp) ev.push({ date: row.followUp.createdAt.slice(0, 10), label: "Follow-up requested", detail: `To ${row.followUp.owner}`, kind: "review" });
  if (row.followUp?.response) ev.push({ date: row.followUp.response.at.slice(0, 10), label: "Follow-up answered", kind: "review" });
  if (row.decision) ev.push({ date: row.decision.proposedAt.slice(0, 10), label: `${row.decision.action} proposed`, detail: `Band ${row.decision.approvalBandId}`, kind: "review" });
  ev.push({ date: asOf, label: "Review date", kind: "asat" });
  const rank: Record<TimelineEvent["kind"], number> = { document: 0, activity: 1, review: 2, asat: 3 };
  return ev.filter((e) => e.date <= asOf || e.kind !== "activity").sort((a, b) => a.date.localeCompare(b.date) || rank[a.kind] - rank[b.kind]);
}

// ---------------------------------------------------------------------------
// One item's way through the process: from the data arriving to the account
// being signed off. Each stage says who holds it and when it moved, so the
// owner sees what to do next and a manager sees where the item waits.
// ---------------------------------------------------------------------------
export type StageId = "source" | "flagged" | "evidence" | "propose" | "approve" | "post" | "account";
/** `optional`: open to the owner but not on the way (asking for evidence when the action is clear) */
export type StageState = "done" | "current" | "optional" | "upcoming" | "skipped";

export interface ItemStage {
  id: StageId;
  label: string;
  state: StageState;
  /** the person, role, agent or system that holds the stage */
  who: string;
  /** when it moved, local ISO date-time */
  when?: string;
  detail: string;
  /** the person inside the company who takes the stage's next step, and their role (absent when nobody has to) */
  personId?: string;
  role?: RoleId;
}

export interface StageInputs {
  row: ItemRow;
  /** absent when the line sits on an account the review does not cover (bank, profit and loss) */
  accountStatus?: AccountReviewStatus;
  signOff?: AccountSignOff;
  /** when the source extracts were taken */
  extractedAt: string;
  /** the dataset the line arrived in */
  dataset?: string;
}

const LIVE = new Set(["proposed", "approved", "exported", "closed-in-erp"]);
const DONE_APPROVAL = new Set(["approved", "exported", "closed-in-erp"]);
/** actions that change no balance, so nothing is posted */
const NO_ENTRY = new Set<ActionKind>(["Retain", "Escalate", "Follow up"]);

/** The person acting in a role: the account's own person when they hold it, otherwise the role's first person. */
function holder(role: RoleId, prefer?: string) {
  return WORLD.people.find((p) => p.id === prefer && p.roleId === role) ?? WORLD.people.find((p) => p.roleId === role)!;
}
const nameOf = (personId?: string) => (personId ? PERSON_BY_ID.get(personId)?.name ?? personId : "");

export function itemStages({ row, accountStatus, signOff, extractedAt, dataset }: StageInputs): ItemStage[] {
  const gl = GL_BY_ID.get(row.item.gl)!;
  const owner = nameOf(gl.ownerId);
  const reviewer = nameOf(gl.reviewerId);
  const byOwner = { personId: gl.ownerId, role: PERSON_BY_ID.get(gl.ownerId)?.roleId };
  const byReviewer = { personId: gl.reviewerId, role: PERSON_BY_ID.get(gl.reviewerId)?.roleId };
  const d = row.decision && LIVE.has(row.decision.status) ? row.decision : undefined;
  const turnedDown = row.decision && !LIVE.has(row.decision.status) ? row.decision : undefined;
  const fu = row.followUp;
  const rec = row.rec;
  const stages: ItemStage[] = [];

  stages.push({ id: "source", label: "Data in", state: "done", who: row.item.sourceSystem, when: extractedAt, detail: dataset ?? "Line item extract" });

  if (!row.flagged) {
    stages.push({ id: "flagged", label: "Checked", state: "done", who: "Scrutiny agent", when: extractedAt, detail: "Within policy" });
    for (const [id, label] of [["evidence", "Evidence"], ["propose", "Decision"], ["approve", "Approval"], ["post", "Posting"]] as const) {
      stages.push({ id, label, state: "skipped", who: "", detail: "Nothing to do" });
    }
  } else {
    const rules = row.hits.map((h) => h.ruleId).slice(0, 3).join(", ");
    stages.push({ id: "flagged", label: "Flagged", state: "done", who: "Scrutiny agent", when: extractedAt, detail: rec ? `${rules} · ${rec.action} recommended` : rules });

    // evidence: asked, answered, or not needed
    const askFirst = rec?.action === "Follow up";
    // the person who asked records the answer
    const asker = fu ? { personId: fu.createdBy, role: PERSON_BY_ID.get(fu.createdBy)?.roleId } : byOwner;
    if (fu && fu.status === "open") stages.push({ id: "evidence", label: "Evidence", state: "current", who: fu.owner, when: fu.createdAt, detail: `Asked by ${nameOf(fu.createdBy)}, due ${fmtDate(fu.dueDate)}`, ...asker });
    else if (fu) stages.push({ id: "evidence", label: "Evidence", state: "done", who: fu.response ? nameOf(fu.response.by) : nameOf(fu.createdBy), when: fu.response?.at ?? fu.createdAt, detail: fu.response ? `Answered by ${fu.owner}` : "Closed without an answer" });
    else if (d) stages.push({ id: "evidence", label: "Evidence", state: "skipped", who: "", detail: "Not requested" });
    else stages.push({ id: "evidence", label: "Evidence", state: askFirst ? "current" : "optional", who: owner, detail: askFirst ? "Ask before deciding" : "Ask the buyer or the counterparty if in doubt", ...byOwner });

    // maker
    const waitingOnEvidence = fu?.status === "open" || (askFirst && !fu);
    if (d) stages.push({ id: "propose", label: "Decision", state: "done", who: nameOf(d.proposedBy), when: d.proposedAt, detail: `${d.action} ${fmtINRCompact(Math.abs(d.amount))}` });
    else if (turnedDown?.status === "rejected") stages.push({ id: "propose", label: "Decision", state: "current", who: owner, when: turnedDown.rejection?.at, detail: `Rejected by ${nameOf(turnedDown.rejection?.personId)}: propose again`, ...byOwner });
    else stages.push({ id: "propose", label: "Decision", state: waitingOnEvidence ? "upcoming" : "current", who: owner, detail: fu?.response ? "Decide on the answer" : rec && rec.action !== "Follow up" ? `${rec.action} recommended` : "Choose the action", ...byOwner });

    // checker
    const band = d ? APPROVAL_BANDS.find((b) => b.id === d.approvalBandId) ?? bandFor(row.item.amount) : bandFor(row.item.amount);
    const chainLabel = (d?.chain ?? band.chain).map((r) => ROLES[r].label).join(", then ");
    if (d && DONE_APPROVAL.has(d.status)) {
      const last = d.approvals[d.approvals.length - 1];
      const tax = d.taxReview?.at && (!last || d.taxReview.at >= last.at) ? d.taxReview : undefined;
      stages.push({ id: "approve", label: "Approval", state: "done", who: tax ? nameOf(tax.personId) : nameOf(last?.personId), when: tax?.at ?? last?.at, detail: `Band ${d.approvalBandId}: ${d.approvals.length} approval${d.approvals.length === 1 ? "" : "s"}${d.taxReview ? ", tax cleared" : ""}` });
    } else if (d) {
      const next = d.chain[d.approvals.length];
      const taxPending = d.taxReviewRequired && !d.taxReview;
      const who = next ? holder(next, gl.reviewerId) : holder("tax-specialist");
      const steps = `${d.approvals.length} of ${d.chain.length} approvals${taxPending ? ", tax review pending" : ""}`;
      stages.push({ id: "approve", label: "Approval", state: "current", who: `${who.name}, ${ROLES[who.roleId].label}`, when: d.approvals[d.approvals.length - 1]?.at, detail: steps, personId: who.id, role: who.roleId });
    } else {
      stages.push({ id: "approve", label: "Approval", state: "upcoming", who: chainLabel, detail: `Band ${band.id}${rec?.requiresTaxReview ? ", tax review" : ""}` });
    }

    // posting in the ERP
    const action = d?.action ?? (rec && rec.action !== "Follow up" ? rec.action : undefined);
    if (action && NO_ENTRY.has(action)) stages.push({ id: "post", label: "Posting", state: "skipped", who: "", detail: "No entry needed" });
    else if (d?.status === "closed-in-erp") stages.push({ id: "post", label: "Posting", state: "done", who: "ERP", detail: d.exportBatchId ? `Batch ${d.exportBatchId} posted` : "Posted" });
    else if (d?.status === "exported") stages.push({ id: "post", label: "Posting", state: "current", who: owner, detail: `In batch ${d.exportBatchId}, waiting to be posted`, ...byOwner });
    else if (d?.status === "approved") stages.push({ id: "post", label: "Posting", state: "current", who: owner, detail: "Export to the proposal file", ...byOwner });
    else stages.push({ id: "post", label: "Posting", state: "upcoming", who: owner, detail: action === "Clear" ? "Clearing instruction" : "Journal proposal" });
  }

  // the account the item sits in
  if (!accountStatus) stages.push({ id: "account", label: "Sign-off", state: "skipped", who: "", detail: "Account not in the review" });
  else if (accountStatus === "reviewer-signed") stages.push({ id: "account", label: "Sign-off", state: "done", who: nameOf(signOff?.reviewer?.personId) || reviewer, when: signOff?.reviewer?.at, detail: `${gl.gl} signed off` });
  else if (accountStatus === "preparer-signed") stages.push({ id: "account", label: "Sign-off", state: "current", who: reviewer, when: signOff?.preparer?.at, detail: `Preparer signed, reviewer to sign`, ...byReviewer });
  else stages.push({ id: "account", label: "Sign-off", state: accountStatus === "ready-for-signoff" ? "current" : "upcoming", who: `${owner}, then ${reviewer}`, detail: `${gl.gl} ${statusLabel(accountStatus).toLowerCase()}`, ...byOwner });

  return stages;
}

/** The stage to open first: the one waiting for someone, else the last that moved. */
export function currentStage(stages: ItemStage[]): ItemStage {
  return stages.find((s) => s.state === "current") ?? [...stages].reverse().find((s) => s.state === "done") ?? stages[0];
}
