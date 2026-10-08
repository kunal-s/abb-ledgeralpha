// Working capital (docs/FRD.md §6.16): the cash tied up in receivables,
// inventory and payables at business-unit and transaction level, from the same
// ledger the review and the statements read. Balances are month-end running
// totals by business unit; the days measures read the trailing months of
// revenue and cost; the drill walks the open items down to the document.

import type { IsoDate, LineItem } from "@/types";
import { PARTY_BY_ID, PC_BY_ID, PROJECT_BY_WBS, WORLD, isOpenAt } from "@/data";
import { AGEING_POLICY, WORKING_CAPITAL_POLICY as P } from "@/config/policies";
import { LOCALISATION } from "@/config/localisation";
import { CORPORATE, buOfProfitCentre } from "@/engine/attribution";
import { previousQuarterEnd } from "@/engine/context";
import { monthsBetween, plMonth, scopePcs, shiftMonth, type PlRow } from "@/engine/pl";
import { BUCKETS, ageOf, bucketOf } from "@/engine/review";
import { daysBetween } from "@/lib/dates";

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

let table: Map<string, WcBalances> | undefined;

/** Month-end balances by business unit: `${month}|${bu}`. Assets and liabilities are both positive. */
function balances(): Map<string, WcBalances> {
  if (table) return table;
  const delta = new Map<string, WcBalances>();
  for (const l of WORLD.lines) {
    const b = BUCKETS_OF.get(l.gl);
    if (!b) continue;
    const k = `${l.postingDate.slice(0, 7)}|${buOfProfitCentre(l.profitCentre)}`;
    const e = delta.get(k) ?? empty();
    e[b.bucket] += b.sign * l.amount;
    delta.set(k, e);
  }
  const first = WORLD.lines.reduce((m, l) => (l.postingDate < m ? l.postingDate : m), WORLD.asOf).slice(0, 7);
  const out = new Map<string, WcBalances>();
  const running = new Map<string, WcBalances>();
  const units = [...WORLD.businessUnits.map((u) => u.id)];
  for (const month of monthsBetween(first, WORLD.asOf.slice(0, 7))) {
    for (const bu of units) {
      const cur = running.get(bu) ?? empty();
      const d = delta.get(`${month}|${bu}`);
      if (d) for (const k of Object.keys(cur) as Bucket[]) cur[k] += d[k];
      running.set(bu, cur);
      out.set(`${month}|${bu}`, { ...cur });
    }
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
    if (b) for (const k of Object.keys(bal) as Bucket[]) bal[k] += b[k];
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
// open items: ageing, drill, MSME
// ---------------------------------------------------------------------------
export type Side = "receivables" | "payables";

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
  /** the part of the amount older than the review threshold */
  aged: number;
  /** age in days of the oldest item */
  oldest: number;
}

export type DrillLevel = "bu" | "pc" | "project" | "party" | "document";

export interface DrillPath {
  bu?: string;
  pc?: string;
  project?: string;
  party?: string;
}

export interface Drill {
  level: DrillLevel;
  rows: DrillRow[];
  /** at the last level: the documents themselves */
  items: LineItem[];
  total: DrillRow;
}

const NO_PROJECT = "none";

/** Receivables walk business unit, profit centre, project, customer, document; payables business unit, profit centre, supplier, document. */
export function drill(side: Side, path: DrillPath, asOf: IsoDate = WORLD.asOf): Drill {
  let items = openOf(side, asOf);
  if (path.bu) items = items.filter((l) => buOfProfitCentre(l.profitCentre) === path.bu);
  if (path.pc) items = items.filter((l) => l.profitCentre === path.pc);
  if (side === "receivables" && path.project) items = items.filter((l) => (l.wbs ?? NO_PROJECT) === path.project);
  if (path.party) items = items.filter((l) => l.partner?.id === path.party);

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

  const rows = new Map<string, DrillRow>();
  const total: DrillRow = { key: "total", label: "Total", count: 0, amount: 0, aged: 0, oldest: 0 };
  const add = (r: DrillRow, l: LineItem) => {
    const age = ageOf(l, asOf);
    const v = balanceOf(side, l);
    r.count += 1;
    r.amount += v;
    if (age > AGEING_POLICY.reviewThresholdDays) r.aged += v;
    if (age > r.oldest) r.oldest = age;
  };
  for (const l of items) {
    add(total, l);
    if (level === "document") continue;
    const k = keyOf(l);
    const r = rows.get(k) ?? { key: k, ...labelOf(k), count: 0, amount: 0, aged: 0, oldest: 0 };
    add(r, l);
    rows.set(k, r);
  }
  return { level, rows: [...rows.values()].sort((a, b) => b.amount - a.amount), items: level === "document" ? items : [], total };
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
