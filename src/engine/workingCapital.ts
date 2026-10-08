// Working capital (docs/FRD.md §6.16): the cash tied up in receivables,
// inventory and payables at business-unit and transaction level, from the same
// ledger the review and the statements read. Balances are month-end totals by
// business unit (the open items of each account as they stood at the month end,
// so a business unit's balance is the sum of its open items); the days measures
// read the trailing months of revenue and cost; the drill walks the open items
// down to the document, each with its next step.

import type { IsoDate, LineItem } from "@/types";
import { PARTY_BY_ID, PC_BY_ID, PROJECT_BY_WBS, WORLD, isOpenAt } from "@/data";
import { AGEING_POLICY, COLLECTION_POLICY as C, WORKING_CAPITAL_POLICY as P } from "@/config/policies";
import { LOCALISATION } from "@/config/localisation";
import { CORPORATE, buOfProfitCentre } from "@/engine/attribution";
import { STEP_ORDER, stepOf, type Side, type Step, type StepId } from "@/engine/collections";
import { previousQuarterEnd } from "@/engine/context";
import { monthsBetween, plMonth, scopePcs, shiftMonth, type PlRow } from "@/engine/pl";
import { BUCKETS, ageOf, bucketOf, type BucketId } from "@/engine/review";
import { daysBetween } from "@/lib/dates";

export type { Side };

export const WC_GLS = {
  receivables: ["140100", "140200", "140300"],
  unbilled: ["141100", "141200"],
  retention: ["142100"],
  advances: ["221100", "221200", "222100"],
  inventory: ["130100", "130200", "130300", "130400", "130500"],
  payables: ["210100", "210200", "210300"],
  grir: ["211300", "211400", "211500"],
} as const;

type Bucket = keyof typeof WC_GLS;
const BUCKETS_OF = new Map<string, { bucket: Bucket; sign: 1 | -1 }>();
for (const [bucket, gls] of Object.entries(WC_GLS) as [Bucket, readonly string[]][]) {
  for (const gl of gls) BUCKETS_OF.set(gl, { bucket, sign: bucket === "advances" || bucket === "payables" || bucket === "grir" ? -1 : 1 });
}

export type WcBalances = Record<Bucket, number>;
const empty = (): WcBalances => ({ receivables: 0, unbilled: 0, retention: 0, advances: 0, inventory: 0, payables: 0, grir: 0 });
const BUCKET_KEYS = Object.keys(WC_GLS) as Bucket[];

let table: Map<string, WcBalances> | undefined;

/**
 * Month-end balances by business unit: `${month}|${bu}`. Assets and liabilities are both positive.
 * An account that is managed by open items counts each item to the unit of the item, from its posting month
 * to the month before it is cleared; inventory is a running balance of its postings.
 */
function balances(): Map<string, WcBalances> {
  if (table) return table;
  const first = WORLD.lines.reduce((m, l) => (l.postingDate < m ? l.postingDate : m), WORLD.asOf).slice(0, 7);
  const months = monthsBetween(first, WORLD.asOf.slice(0, 7));
  const index = new Map(months.map((m, i) => [m, i]));
  const units = WORLD.businessUnits.map((u) => u.id);
  // a difference array per unit and bucket: the value is added at the first month and taken back after the last
  const diff = new Map<string, Float64Array>();
  for (const bu of units) for (const k of BUCKET_KEYS) diff.set(`${bu}|${k}`, new Float64Array(months.length + 1));
  for (const l of WORLD.lines) {
    const b = BUCKETS_OF.get(l.gl);
    if (!b) continue;
    const start = index.get(l.postingDate.slice(0, 7));
    if (start === undefined) continue;
    const end = b.bucket === "inventory" || !l.clearing ? months.length - 1 : (index.get(l.clearing.date.slice(0, 7)) ?? months.length) - 1;
    if (end < start) continue;
    const bu = buOfProfitCentre(l.profitCentre);
    const d = diff.get(`${bu}|${b.bucket}`) ?? diff.get(`${CORPORATE}|${b.bucket}`)!;
    const v = b.sign * l.amount;
    d[start] += v;
    d[end + 1] -= v;
  }
  const out = new Map<string, WcBalances>();
  for (const bu of units) {
    const running = empty();
    months.forEach((month, i) => {
      for (const k of BUCKET_KEYS) running[k] += diff.get(`${bu}|${k}`)![i];
      out.set(`${month}|${bu}`, { ...running });
    });
  }
  table = out;
  return out;
}

export interface WcMetrics {
  month: string;
  /** a business unit id, or "all" */
  bu: string;
  balances: WcBalances;
  revenue: number;
  /** material plus other expenses: what the payables are for */
  purchases: number;
  material: number;
  days: number;
  /** receivables, unbilled revenue and retention over revenue */
  dso: number;
  /** the same, less customer advances */
  dsoFunded: number;
  dpo: number;
  /** only where the unit holds inventory */
  dio?: number;
  /** funded days of sales plus days of inventory less days of payables */
  cycle?: number;
  /** cash tied up: receivables, unbilled revenue, retention and inventory less payables and customer advances */
  netWorkingCapital: number;
}

const daysIn = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();

export function wcMetrics(month: string, bu: string): WcMetrics {
  const units = bu === "all" ? WORLD.businessUnits.map((u) => u.id) : [bu];
  const bal = empty();
  for (const u of units) {
    const b = balances().get(`${month}|${u}`);
    if (b) for (const k of BUCKET_KEYS) bal[k] += b[k];
  }
  const window = monthsBetween(shiftMonth(month, 1 - P.daysBasisMonths), month);
  const pcs = bu === "all" ? scopePcs({ kind: "company" }) : scopePcs({ kind: "bu", id: bu });
  let revenue = 0;
  let material = 0;
  let purchases = 0;
  let days = 0;
  for (const m of window) {
    const r: PlRow = plMonth(m, pcs);
    revenue += r.revenue;
    material += r.material;
    purchases += r.material + r.other + r.fxLoss + r.oneOffExpense;
    days += daysIn(m);
  }
  const receivable = bal.receivables + bal.unbilled + bal.retention;
  const dso = revenue > 0 ? (receivable / revenue) * days : 0;
  const dsoFunded = revenue > 0 ? ((receivable - bal.advances) / revenue) * days : 0;
  const dpo = purchases > 0 ? ((bal.payables + bal.grir) / purchases) * days : 0;
  // inventory is held at company level (the opening balances sit with corporate), so days of inventory are the company's
  const dio = bu === "all" && bal.inventory > 0 && material > 0 ? (bal.inventory / material) * days : undefined;
  return {
    month, bu, balances: bal, revenue, purchases, material, days, dso, dsoFunded, dpo, dio,
    cycle: dio === undefined ? undefined : dsoFunded + dio - dpo,
    netWorkingCapital: receivable + bal.inventory - bal.payables - bal.grir - bal.advances,
  };
}

/**
 * The first month whose balances can be read: the demo ledger carries the open items still open today and those
 * settled since the last review, so balances of earlier months are incomplete and are not shown.
 */
export const reliableFrom = (): string => previousQuarterEnd(WORLD.asOf).slice(0, 7);

/** The measures at each of the last month ends from the first reliable one, oldest first. */
export function wcTrend(bu: string, upTo: string = WORLD.asOf.slice(0, 7), months: number = P.trendMonths): WcMetrics[] {
  const from = shiftMonth(upTo, 1 - months);
  return monthsBetween(from > reliableFrom() ? from : reliableFrom(), upTo).map((m) => wcMetrics(m, bu));
}

// ---------------------------------------------------------------------------
// grading
// ---------------------------------------------------------------------------
export type Grade = "ok" | "watch" | "act";

export const GRADE_LABEL: Record<Grade, string> = { ok: "On track", watch: "Watch", act: "Act" };

/** How a days-of-sales figure stands against the policy: on track, watched, or needing action. */
export function dsoGrade(days: number): Grade {
  return days > P.dsoActionDays ? "act" : days > P.dsoWatchDays ? "watch" : "ok";
}

/** How the share of a balance older than the review threshold stands against the policy. */
export function agedGrade(share: number): Grade {
  return share >= P.agedShareAct ? "act" : share >= P.agedShareWatch ? "watch" : "ok";
}

// ---------------------------------------------------------------------------
// open items: ageing, drill, MSME
// ---------------------------------------------------------------------------
const SIDE_GLS: Record<Side, readonly string[]> = {
  receivables: [...WC_GLS.receivables, ...WC_GLS.retention],
  payables: WC_GLS.payables,
};

let itemCache = new Map<string, LineItem[]>();

/** Open items on the receivable or payable accounts at a date, oldest first. */
export function openOf(side: Side, asOf: IsoDate = WORLD.asOf): LineItem[] {
  const k = `${side}|${asOf}`;
  const hit = itemCache.get(k);
  if (hit) return hit;
  const set = new Set(SIDE_GLS[side]);
  const out = WORLD.lines.filter((l) => set.has(l.gl) && isOpenAt(l, asOf)).sort((a, b) => a.postingDate.localeCompare(b.postingDate));
  if (itemCache.size > 8) itemCache = new Map();
  itemCache.set(k, out);
  return out;
}

/** The amount of an open item as a positive balance of its side: receivables as debits, payables as credits. */
export const balanceOf = (side: Side, l: LineItem): number => (side === "receivables" ? l.amount : -l.amount);

let stepCache = new Map<string, Map<string, Step>>();

/** The next step of every open item of a side, by line key. */
export function stepsOf(side: Side, asOf: IsoDate = WORLD.asOf): Map<string, Step> {
  const k = `${side}|${asOf}`;
  const hit = stepCache.get(k);
  if (hit) return hit;
  const out = new Map<string, Step>();
  for (const l of openOf(side, asOf)) out.set(l.key, stepOf(side, l, asOf));
  if (stepCache.size > 8) stepCache = new Map();
  stepCache.set(k, out);
  return out;
}

export interface AgeingRow {
  id: string;
  label: string;
  count: number;
  amount: number;
}

/** Open items by the review ageing buckets. */
export function reviewAgeing(side: Side, asOf: IsoDate = WORLD.asOf): AgeingRow[] {
  const rows = BUCKETS.map((b): AgeingRow => ({ id: b.id, label: b.label, count: 0, amount: 0 }));
  for (const l of openOf(side, asOf)) {
    const r = rows.find((x) => x.id === bucketOf(ageOf(l, asOf)))!;
    r.count += 1;
    r.amount += balanceOf(side, l);
  }
  return rows;
}

/** Open items by the statutory disclosure bands (in months from the posting date). */
export function statutoryAgeing(side: Side, asOf: IsoDate = WORLD.asOf): AgeingRow[] {
  const bands = side === "receivables" ? LOCALISATION.disclosureAgeing.tradeReceivables : LOCALISATION.disclosureAgeing.tradePayablesAndCwip;
  const rows = bands.map((b, i): AgeingRow => ({ id: String(i), label: b.label, count: 0, amount: 0 }));
  for (const l of openOf(side, asOf)) {
    const months = daysBetween(l.postingDate, asOf) / 30.4375;
    const i = bands.findIndex((b) => b.maxMonths === null || months < b.maxMonths);
    rows[i].count += 1;
    rows[i].amount += balanceOf(side, l);
  }
  return rows;
}

export interface DrillRow {
  key: string;
  label: string;
  sublabel?: string;
  count: number;
  amount: number;
  /** the amount in each review ageing bucket */
  bands: Record<BucketId, number>;
  /** the part of the amount older than the review threshold */
  aged: number;
  /** the part of the amount past its due date */
  pastDue: number;
  /** the items that need a step taken, and their amount */
  toAct: number;
  toActAmount: number;
  /** age in days of the oldest item */
  oldest: number;
}

export type DrillLevel = "bu" | "pc" | "project" | "party" | "document";

export interface DrillPath {
  bu?: string;
  pc?: string;
  project?: string;
  party?: string;
  /** only the items in this review ageing bucket */
  band?: BucketId;
  /** only the items whose next step is this one */
  step?: StepId;
}

export interface Drill {
  level: DrillLevel;
  rows: DrillRow[];
  /** at the last level, or when the documents are asked for: the documents themselves, oldest first */
  items: LineItem[];
  total: DrillRow;
  /** the next step of each document in `items` */
  steps: Map<string, Step>;
}

const NO_PROJECT = "none";

const emptyBands = (): Record<BucketId, number> => Object.fromEntries(BUCKETS.map((b) => [b.id, 0])) as Record<BucketId, number>;

/**
 * Receivables walk business unit, profit centre, project, customer, document; payables business unit, profit
 * centre, supplier, document. A band or a step narrows every level to the items in it; `documents` lists the
 * items of the view whatever the level.
 */
export function drill(side: Side, path: DrillPath, asOf: IsoDate = WORLD.asOf, documents = false): Drill {
  const steps = stepsOf(side, asOf);
  let items = openOf(side, asOf);
  if (path.bu) items = items.filter((l) => buOfProfitCentre(l.profitCentre) === path.bu);
  if (path.pc) items = items.filter((l) => l.profitCentre === path.pc);
  if (side === "receivables" && path.project) items = items.filter((l) => (l.wbs ?? NO_PROJECT) === path.project);
  if (path.party) items = items.filter((l) => l.partner?.id === path.party);
  if (path.band) items = items.filter((l) => bucketOf(ageOf(l, asOf)) === path.band);
  if (path.step) items = items.filter((l) => steps.get(l.key)?.id === path.step);

  const level: DrillLevel = !path.bu ? "bu" : !path.pc ? "pc" : side === "receivables" && !path.project ? "project" : !path.party ? "party" : "document";
  const keyOf = (l: LineItem): string => {
    if (level === "bu") return buOfProfitCentre(l.profitCentre);
    if (level === "pc") return l.profitCentre;
    if (level === "project") return l.wbs ?? NO_PROJECT;
    return l.partner?.id ?? NO_PROJECT;
  };
  const labelOf = (key: string): { label: string; sublabel?: string } => {
    if (level === "bu") return { label: key === CORPORATE ? "Corporate" : WORLD.businessUnits.find((b) => b.id === key)?.name ?? key };
    if (level === "pc") return { label: PC_BY_ID.get(key)?.name ?? key, sublabel: key };
    if (level === "project") return key === NO_PROJECT ? { label: "No project" } : { label: PROJECT_BY_WBS.get(key)?.name ?? key, sublabel: key };
    const p = PARTY_BY_ID.get(key);
    return key === NO_PROJECT ? { label: "No business partner" } : { label: p?.name ?? key, sublabel: p?.msme ? `${p.msme} enterprise` : undefined };
  };

  const blank = (key: string, label: string, sublabel?: string): DrillRow => ({ key, label, sublabel, count: 0, amount: 0, bands: emptyBands(), aged: 0, pastDue: 0, toAct: 0, toActAmount: 0, oldest: 0 });
  const rows = new Map<string, DrillRow>();
  const total = blank("total", "Total");
  const add = (r: DrillRow, l: LineItem) => {
    const age = ageOf(l, asOf);
    const v = balanceOf(side, l);
    r.count += 1;
    r.amount += v;
    r.bands[bucketOf(age)] += v;
    if (age > AGEING_POLICY.reviewThresholdDays) r.aged += v;
    if (l.dueDate && l.dueDate < asOf && v > 0) r.pastDue += v;
    if (steps.get(l.key)?.action) {
      r.toAct += 1;
      r.toActAmount += v;
    }
    if (age > r.oldest) r.oldest = age;
  };
  for (const l of items) {
    add(total, l);
    if (level === "document") continue;
    const k = keyOf(l);
    const r = rows.get(k) ?? { ...blank(k, ""), ...labelOf(k), key: k };
    add(r, l);
    rows.set(k, r);
  }
  const listed = level === "document" || documents;
  return { level, rows: [...rows.values()].sort((a, b) => b.amount - a.amount), items: listed ? [...items].sort((a, b) => a.postingDate.localeCompare(b.postingDate)) : [], total, steps };
}

export interface MsmeItem {
  line: LineItem;
  vendor: string;
  enterprise: "Micro" | "Small";
  /** days from the invoice to the date */
  days: number;
  /** days beyond the payment window */
  overdue: number;
  amount: number;
}

/** Unpaid invoices of micro and small suppliers older than the statutory payment window, largest delay first. */
export function msmeOverdue(asOf: IsoDate = WORLD.asOf): MsmeItem[] {
  const out: MsmeItem[] = [];
  for (const l of openOf("payables", asOf)) {
    if (l.amount >= 0 || !l.partner) continue; // an invoice is a credit; debits are advances and credit notes
    const vendor = PARTY_BY_ID.get(l.partner.id);
    if (!vendor?.msme || vendor.msme === "Medium") continue;
    const days = daysBetween(l.documentDate, asOf);
    if (days <= P.msmePaymentDays) continue;
    out.push({ line: l, vendor: vendor.name, enterprise: vendor.msme, days, overdue: days - P.msmePaymentDays, amount: -l.amount });
  }
  return out.sort((a, b) => b.overdue - a.overdue || b.amount - a.amount);
}

// ---------------------------------------------------------------------------
// where the days are: the drivers of a unit's days of sales, and what to do about them
// ---------------------------------------------------------------------------
export interface DsoDriver {
  id: string;
  label: string;
  amount: number;
  /** the amount in days of sales: the amount over the revenue of the period, times its days */
  days: number;
}

/** The drivers, in the order they are listed. The first four are invoices by how the collection policy reads them. */
const DRIVERS: { id: string; label: string }[] = [
  { id: "not-due", label: "Not yet due" },
  { id: "remind", label: `1 to ${C.confirmAfterDaysPastDue - 1} days past due` },
  { id: "confirm", label: `${C.confirmAfterDaysPastDue} to ${C.escalateAfterDaysPastDue - 1} days past due` },
  { id: "escalate", label: `Over ${C.escalateAfterDaysPastDue - 1} days past due, or a year old` },
  { id: "retention", label: "Retention" },
  { id: "unbilled", label: "Unbilled revenue" },
  { id: "credits", label: "Credits not applied" },
];

/**
 * The days of sales of a unit (or "all"), split by what the receivable is made of: invoices by how far past
 * their due date they are, retention, unbilled revenue and credits not yet applied. They add up to the unit's DSO.
 */
export function dsoDrivers(bu: string, asOf: IsoDate = WORLD.asOf): DsoDriver[] {
  const m = wcMetrics(asOf.slice(0, 7), bu);
  const steps = stepsOf("receivables", asOf);
  const amounts: Record<string, number> = { "not-due": 0, remind: 0, confirm: 0, escalate: 0, retention: 0, unbilled: m.balances.unbilled, credits: 0 };
  for (const l of openOf("receivables", asOf)) {
    if (bu !== "all" && buOfProfitCentre(l.profitCentre) !== bu) continue;
    if (l.gl === WC_GLS.retention[0]) amounts.retention += l.amount;
    else if (l.amount < 0) amounts.credits += l.amount;
    else amounts[steps.get(l.key)!.id] += l.amount;
  }
  return DRIVERS.map(({ id, label }): DsoDriver => ({ id, label, amount: amounts[id], days: m.revenue > 0 ? (amounts[id] / m.revenue) * m.days : 0 }));
}

export interface ExcessRow extends DsoDriver {
  /** the company's days for the same driver */
  company: number;
  /** days above (below) the company: they add up to the unit's DSO less the company's */
  delta: number;
}

/** A unit's days of sales against the company's, driver by driver. */
export function dsoExcess(bu: string, asOf: IsoDate = WORLD.asOf): ExcessRow[] {
  const all = new Map(dsoDrivers("all", asOf).map((d) => [d.id, d.days]));
  return dsoDrivers(bu, asOf).map((d) => ({ ...d, company: all.get(d.id) ?? 0, delta: d.days - (all.get(d.id) ?? 0) }));
}

export interface StepRow {
  id: StepId;
  label: string;
  count: number;
  amount: number;
  /** the part of the amount past its due date */
  pastDue: number;
}

export interface Holder {
  partyId: string;
  name: string;
  count: number;
  amount: number;
  /** share of the amount that needs a step */
  share: number;
}

export interface UnitInsight {
  bu: string;
  name: string;
  metrics: WcMetrics;
  grade: Grade;
  /** days of sales above the company's */
  excess: number;
  drivers: ExcessRow[];
  /** the steps to take, the most pressing first */
  steps: StepRow[];
  /** the customers holding most of what needs a step */
  holders: Holder[];
  /** the amount that needs a step */
  toActAmount: number;
}

/** What the receivables of a unit need: the items by next step and the customers that hold them. */
export function receivableSteps(bu: string, asOf: IsoDate = WORLD.asOf): { steps: StepRow[]; holders: Holder[]; toActAmount: number } {
  const steps = stepsOf("receivables", asOf);
  const rows = new Map<StepId, StepRow>();
  const byParty = new Map<string, Holder>();
  let toActAmount = 0;
  for (const l of openOf("receivables", asOf)) {
    if (bu !== "all" && buOfProfitCentre(l.profitCentre) !== bu) continue;
    const s = steps.get(l.key)!;
    if (!s.action) continue;
    const v = l.amount;
    const r = rows.get(s.id) ?? { id: s.id, label: STEP_ORDER.find((o) => o.id === s.id)!.label, count: 0, amount: 0, pastDue: 0 };
    r.count += 1;
    r.amount += v;
    if (l.dueDate && l.dueDate < asOf && v > 0) r.pastDue += v;
    rows.set(s.id, r);
    toActAmount += v;
    if (l.partner && v > 0) {
      const h = byParty.get(l.partner.id) ?? { partyId: l.partner.id, name: PARTY_BY_ID.get(l.partner.id)?.name ?? l.partner.id, count: 0, amount: 0, share: 0 };
      h.count += 1;
      h.amount += v;
      byParty.set(l.partner.id, h);
    }
  }
  const order = new Map(STEP_ORDER.map((o, i) => [o.id, i]));
  return {
    steps: [...rows.values()].sort((a, b) => order.get(a.id)! - order.get(b.id)!),
    holders: [...byParty.values()].map((h) => ({ ...h, share: toActAmount > 0 ? h.amount / toActAmount : 0 })).sort((a, b) => b.amount - a.amount).slice(0, 3),
    toActAmount,
  };
}

/** The business units whose days of sales are above the policy's watch level, the highest first. */
export function attention(asOf: IsoDate = WORLD.asOf): UnitInsight[] {
  const month = asOf.slice(0, 7);
  const company = wcMetrics(month, "all");
  const out: UnitInsight[] = [];
  for (const b of WORLD.businessUnits) {
    if (b.id === CORPORATE) continue;
    const metrics = wcMetrics(month, b.id);
    const grade = dsoGrade(metrics.dso);
    if (grade === "ok") continue;
    out.push({ bu: b.id, name: b.name, metrics, grade, excess: metrics.dso - company.dso, drivers: dsoExcess(b.id, asOf), ...receivableSteps(b.id, asOf) });
  }
  return out.sort((a, b) => b.metrics.dso - a.metrics.dso);
}
