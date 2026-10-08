// Working capital (docs/FRD.md §6.16, D-54): the cash tied up in the business,
// read from the same ledger as every other module. Receivable, inventory and
// payable days are the closing balance over the average daily flow of the last
// three months; each figure has its definition in `DEFINITIONS`, shown as a
// tooltip, and drills to the business unit, the party and the document.

import type { AccountCategory, GlAccount, IsoDate, LineItem } from "@/types";
import { BALANCES, PARTY_BY_ID, PC_BY_ID, WORLD, isOpenAt } from "@/data";
import { LOCALISATION } from "@/config/localisation";
import { daysBetween } from "@/lib/dates";

export const WORKING_CAPITAL_POLICY = {
  /** the flow behind a day count is the last this many months */
  flowMonths: 3,
  /** micro and small enterprises must be paid within this many days */
  msmeDays: 45,
  trendMonths: 12,
} as const;

export const DEFINITIONS = {
  dso: "Receivable days: trade receivables, unbilled revenue and retention at the period end, divided by the average daily revenue of the last three months.",
  dio: "Inventory days: inventories at the period end, divided by the average daily cost of materials of the last three months.",
  dpo: "Payable days: trade payables and GR/IR clearing at the period end, divided by the average daily cost of materials and other expenses of the last three months.",
  ccc: "Cash conversion cycle: receivable days plus inventory days less payable days. The days between paying for materials and being paid by the customer.",
  nwc: "Net working capital: receivables, unbilled revenue, retention and inventory, less trade payables and GR/IR clearing and customer advances.",
  funded: "Customer advances netted: the part of working capital that customers have already paid for. Net working capital before advances shows the position without them.",
  msme: "Payables to micro and small enterprises that are older than the payment window. Interest and a tax disallowance can follow, so they are shown apart.",
} as const;

// ---------------------------------------------------------------------------
// Account groups
// ---------------------------------------------------------------------------
const gls = (pred: (g: GlAccount) => boolean) => WORLD.glAccounts.filter(pred).map((g) => g.gl);
const inCategory = (...c: AccountCategory[]) => (g: GlAccount) => c.includes(g.category);
const line = (name: string) => (g: GlAccount) => g.statementLine === name;

const GROUPS = {
  /** the allowance for credit loss is not a receivable */
  receivables: gls((g) => (g.category === "trade-recv" && g.gl !== "149100") || g.category === "unbilled" || g.category === "retention"),
  inventory: gls(inCategory("inventory")),
  payables: gls(inCategory("trade-pay", "grir")),
  advances: gls(inCategory("customer-adv")),
  revenue: gls(line("Revenue from operations")),
  materials: gls(line("Cost of materials consumed")),
  otherExpenses: gls(line("Other expenses")),
};

const periods = BALANCES.periods;

function closingAt(group: string[], i: number): number {
  let s = 0;
  for (const gl of group) s += BALANCES.byGl.get(gl)?.[i]?.closing ?? 0;
  return s;
}

/** Net movement of the accounts in the month ending at index `i`, debit positive. */
function movementAt(group: string[], i: number): number {
  let s = 0;
  for (const gl of group) {
    const b = BALANCES.byGl.get(gl)?.[i];
    if (b) s += b.debits + b.credits;
  }
  return s;
}

function flow(group: string[], i: number, sign: 1 | -1): number {
  let s = 0;
  for (let k = i - WORKING_CAPITAL_POLICY.flowMonths + 1; k <= i; k += 1) s += sign * movementAt(group, k);
  return s;
}

const perDay = (total: number, i: number) => total / Math.max(1, daysBetween(periods[i - WORKING_CAPITAL_POLICY.flowMonths], periods[i]));
const days = (balance: number, dailyFlow: number) => (dailyFlow > 0 ? balance / dailyFlow : 0);

// ---------------------------------------------------------------------------
// Company-level measures and the trend
// ---------------------------------------------------------------------------
export interface WcPoint {
  periodEnd: IsoDate;
  receivables: number;
  inventory: number;
  payables: number;
  advances: number;
  dso: number;
  dio: number;
  dpo: number;
  ccc: number;
  nwc: number;
}

export function wcPointAt(periodEnd: IsoDate): WcPoint | undefined {
  const i = periods.indexOf(periodEnd);
  if (i < WORKING_CAPITAL_POLICY.flowMonths) return undefined;
  const receivables = closingAt(GROUPS.receivables, i);
  const inventory = closingAt(GROUPS.inventory, i);
  const payables = -closingAt(GROUPS.payables, i);
  const advances = -closingAt(GROUPS.advances, i);
  const revenue = perDay(flow(GROUPS.revenue, i, -1), i);
  const materials = perDay(flow(GROUPS.materials, i, 1), i);
  const purchases = perDay(flow(GROUPS.materials, i, 1) + flow(GROUPS.otherExpenses, i, 1), i);
  const dso = days(receivables, revenue);
  const dio = days(inventory, materials);
  const dpo = days(payables, purchases);
  return { periodEnd, receivables, inventory, payables, advances, dso, dio, dpo, ccc: dso + dio - dpo, nwc: receivables + inventory - payables - advances };
}

export function wcTrend(periodEnd: IsoDate): WcPoint[] {
  const i = periods.indexOf(periodEnd);
  const out: WcPoint[] = [];
  for (let k = Math.max(WORKING_CAPITAL_POLICY.flowMonths, i - WORKING_CAPITAL_POLICY.trendMonths + 1); k <= i; k += 1) {
    const p = wcPointAt(periods[k]);
    if (p) out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------------------
// By business unit: open items and the flow of their profit centres
// ---------------------------------------------------------------------------
export interface BuWc {
  businessUnitId: string;
  name: string;
  receivables: number;
  revenueDaily: number;
  dso: number;
  payables: number;
  purchasesDaily: number;
  dpo: number;
  /** receivables older than six months */
  overSixMonths: number;
}

const buOf = (pc: string) => PC_BY_ID.get(pc)?.businessUnitId ?? "CORP";
const set = (a: string[]) => new Set(a);
const RECEIVABLE_SET = set(GROUPS.receivables);
const PAYABLE_SET = set(GROUPS.payables);
const REVENUE_SET = set(GROUPS.revenue);
const PURCHASE_SET = set([...GROUPS.materials, ...GROUPS.otherExpenses]);

export function byBusinessUnit(periodEnd: IsoDate): BuWc[] {
  const i = periods.indexOf(periodEnd);
  const from = i >= WORKING_CAPITAL_POLICY.flowMonths ? periods[i - WORKING_CAPITAL_POLICY.flowMonths] : periodEnd;
  const span = Math.max(1, daysBetween(from, periodEnd));
  const rows = new Map<string, BuWc>();
  const row = (id: string): BuWc => {
    let r = rows.get(id);
    if (!r) {
      r = { businessUnitId: id, name: WORLD.businessUnits.find((b) => b.id === id)?.name ?? id, receivables: 0, revenueDaily: 0, dso: 0, payables: 0, purchasesDaily: 0, dpo: 0, overSixMonths: 0 };
      rows.set(id, r);
    }
    return r;
  };
  for (const l of WORLD.lines) {
    if (l.postingDate > periodEnd) continue;
    const bu = buOf(l.profitCentre);
    if (RECEIVABLE_SET.has(l.gl) && isOpenAt(l, periodEnd)) {
      const r = row(bu);
      r.receivables += l.amount;
      if (l.amount > 0 && daysBetween(l.dueDate ?? l.postingDate, periodEnd) > 182) r.overSixMonths += l.amount;
    } else if (PAYABLE_SET.has(l.gl) && isOpenAt(l, periodEnd)) {
      row(bu).payables -= l.amount;
    } else if (l.postingDate > from) {
      if (REVENUE_SET.has(l.gl)) row(bu).revenueDaily -= l.amount / span;
      else if (PURCHASE_SET.has(l.gl)) row(bu).purchasesDaily += l.amount / span;
    }
  }
  for (const r of rows.values()) {
    r.dso = days(r.receivables, r.revenueDaily);
    r.dpo = days(r.payables, r.purchasesDaily);
  }
  return [...rows.values()].filter((r) => r.receivables !== 0 || r.payables !== 0 || r.revenueDaily !== 0).sort((a, b) => b.receivables - a.receivables);
}

// ---------------------------------------------------------------------------
// Ageing, in the statutory bands of the disclosure notes
// ---------------------------------------------------------------------------
export interface StatutoryBand {
  label: string;
  count: number;
  amount: number;
}

/** Open items by the age of their due date, in the statutory bands (months). */
export function statutoryAgeing(lines: LineItem[], bands: readonly { label: string; maxMonths: number | null }[], periodEnd: IsoDate): StatutoryBand[] {
  const out: StatutoryBand[] = bands.map((b) => ({ label: b.label, count: 0, amount: 0 }));
  for (const l of lines) {
    const months = daysBetween(l.dueDate ?? l.documentDate, periodEnd) / 30.4375;
    const k = bands.findIndex((b) => b.maxMonths === null || months <= b.maxMonths);
    out[Math.max(0, k)].count += 1;
    out[Math.max(0, k)].amount += Math.abs(l.amount);
  }
  return out;
}

const openOn = (set: Set<string>, periodEnd: IsoDate, side: "debit" | "credit") =>
  WORLD.lines.filter((l) => set.has(l.gl) && l.postingDate <= periodEnd && isOpenAt(l, periodEnd) && (side === "debit" ? l.amount > 0 : l.amount < 0));

export function receivablesAgeing(periodEnd: IsoDate): StatutoryBand[] {
  const trade = set(WORLD.glAccounts.filter((g) => g.category === "trade-recv" && g.gl !== "149100").map((g) => g.gl));
  return statutoryAgeing(openOn(trade, periodEnd, "debit"), LOCALISATION.disclosureAgeing.tradeReceivables, periodEnd);
}

export function payablesAgeing(periodEnd: IsoDate): StatutoryBand[] {
  const trade = set(WORLD.glAccounts.filter((g) => g.category === "trade-pay").map((g) => g.gl));
  return statutoryAgeing(openOn(trade, periodEnd, "credit"), LOCALISATION.disclosureAgeing.tradePayablesAndCwip, periodEnd);
}

// ---------------------------------------------------------------------------
// Balances by party, and payables to small enterprises beyond the window
// ---------------------------------------------------------------------------
export interface PartyBalance {
  partyId: string;
  name: string;
  businessUnitId: string;
  balance: number;
  count: number;
  oldest: number;
  overdue: number;
  msme?: string;
}

function partyBalances(accounts: Set<string>, periodEnd: IsoDate, sign: 1 | -1, overdueDays: number): PartyBalance[] {
  const m = new Map<string, PartyBalance & { buAmounts: Map<string, number> }>();
  for (const l of WORLD.lines) {
    if (!accounts.has(l.gl) || !l.partner || l.postingDate > periodEnd || !isOpenAt(l, periodEnd)) continue;
    const p = PARTY_BY_ID.get(l.partner.id);
    const e = m.get(l.partner.id) ?? { partyId: l.partner.id, name: p?.name ?? l.partner.id, businessUnitId: "CORP", balance: 0, count: 0, oldest: 0, overdue: 0, msme: p?.msme, buAmounts: new Map<string, number>() };
    const age = daysBetween(l.postingDate, periodEnd);
    e.balance += sign * l.amount;
    e.count += 1;
    e.oldest = Math.max(e.oldest, age);
    if (sign * l.amount > 0 && age > overdueDays) e.overdue += sign * l.amount;
    const bu = buOf(l.profitCentre);
    e.buAmounts.set(bu, (e.buAmounts.get(bu) ?? 0) + Math.abs(l.amount));
    m.set(l.partner.id, e);
  }
  return [...m.values()]
    .map(({ buAmounts, ...p }) => ({ ...p, businessUnitId: [...buAmounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "CORP" }))
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

export function customerBalances(periodEnd: IsoDate): PartyBalance[] {
  const accounts = set(WORLD.glAccounts.filter((g) => g.category === "trade-recv" && g.gl !== "149100").map((g) => g.gl));
  return partyBalances(accounts, periodEnd, 1, 182);
}

export function vendorBalances(periodEnd: IsoDate): PartyBalance[] {
  const accounts = set(WORLD.glAccounts.filter((g) => g.category === "trade-pay").map((g) => g.gl));
  return partyBalances(accounts, periodEnd, -1, WORKING_CAPITAL_POLICY.msmeDays);
}

export interface MsmeOverdue {
  count: number;
  value: number;
  vendors: { partyId: string; name: string; msme: string; value: number; count: number; oldest: number }[];
}

/** Invoices of micro and small enterprises still unpaid beyond the payment window. */
export function msmeOverdue(periodEnd: IsoDate): MsmeOverdue {
  const accounts = set(WORLD.glAccounts.filter((g) => g.gl.startsWith("2101")).map((g) => g.gl));
  const m = new Map<string, MsmeOverdue["vendors"][number]>();
  let count = 0;
  let value = 0;
  for (const l of WORLD.lines) {
    if (!accounts.has(l.gl) || l.amount >= 0 || !l.partner || l.postingDate > periodEnd || !isOpenAt(l, periodEnd)) continue;
    const p = PARTY_BY_ID.get(l.partner.id);
    if (p?.msme !== "Micro" && p?.msme !== "Small") continue;
    const age = daysBetween(l.postingDate, periodEnd);
    if (age <= WORKING_CAPITAL_POLICY.msmeDays) continue;
    count += 1;
    value += -l.amount;
    const e = m.get(l.partner.id) ?? { partyId: l.partner.id, name: p.name, msme: p.msme, value: 0, count: 0, oldest: 0 };
    e.value += -l.amount;
    e.count += 1;
    e.oldest = Math.max(e.oldest, age);
    m.set(l.partner.id, e);
  }
  return { count, value, vendors: [...m.values()].sort((a, b) => b.value - a.value) };
}

