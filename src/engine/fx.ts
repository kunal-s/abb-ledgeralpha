// Foreign-currency exposure (docs/FRD.md §6.10, D-62): the monetary balances
// in foreign currency (receivables, payables, group balances) by currency and
// by when they settle, the forwards that cover them, and what revaluing them
// at the closing rate does to the result. Advances paid are not monetary and
// are not revalued, so they are left out.

import type { ForwardContract, IsoDate, LineItem } from "@/types";
import { WORLD, PC_BY_ID, isOpenAt } from "@/data";
import { FX_MONETARY_GLS } from "@/data/generator/reference";
import { daysBetween } from "@/lib/dates";

export const FX_BUCKETS = [
  { id: "overdue", label: "Overdue" },
  { id: "0-30", label: "Within 30 days" },
  { id: "31-60", label: "31 to 60 days" },
  { id: "61-90", label: "61 to 90 days" },
  { id: "91+", label: "After 90 days" },
] as const;
export type FxBucket = (typeof FX_BUCKETS)[number]["id"];

export const bucketOfDays = (days: number): FxBucket => (days < 0 ? "overdue" : days <= 30 ? "0-30" : days <= 60 ? "31-60" : days <= 90 ? "61-90" : "91+");

export function closingRate(currency: string, asOf: IsoDate): number {
  return WORLD.fxRates.find((r) => r.currency === currency && r.periodEnd === asOf)?.closing ?? 0;
}

export interface FxItem {
  line: LineItem;
  currency: string;
  side: "receivable" | "payable";
  /** amount in the currency, always positive */
  fx: number;
  /** what the books carry, in rupees, always positive */
  booked: number;
  /** the same amount at the closing rate */
  revalued: number;
  /** gain positive, loss negative */
  unrealised: number;
  due: IsoDate;
  days: number;
  bucket: FxBucket;
  businessUnitId: string;
}

export function fxItems(asOf: IsoDate = WORLD.asOf): FxItem[] {
  const out: FxItem[] = [];
  for (const l of WORLD.lines) {
    if (l.docCurrency === "INR" || !FX_MONETARY_GLS.has(l.gl) || l.postingDate > asOf || !isOpenAt(l, asOf)) continue;
    const rate = closingRate(l.docCurrency, asOf);
    if (!rate) continue;
    const due = l.dueDate ?? l.postingDate;
    const days = daysBetween(asOf, due);
    const receivable = l.amountDoc > 0;
    const fx = Math.abs(l.amountDoc);
    const booked = Math.abs(l.amount);
    const revalued = fx * rate;
    // an asset worth more, or a liability worth less, is a gain
    const unrealised = receivable ? revalued - booked : booked - revalued;
    out.push({ line: l, currency: l.docCurrency, side: receivable ? "receivable" : "payable", fx, booked, revalued, unrealised, due, days, bucket: bucketOfDays(days), businessUnitId: PC_BY_ID.get(l.profitCentre)?.businessUnitId ?? "CORP" });
  }
  return out;
}

export const forwardMtm = (f: ForwardContract, spot: number) => (f.direction === "Buy" ? (spot - f.rate) * f.amountFx : (f.rate - spot) * f.amountFx);

export interface CurrencyExposure {
  currency: string;
  rate: number;
  /** signed amount in the currency per bucket: receivables positive, payables negative */
  net: Record<FxBucket, number>;
  /** forward notional per bucket that offsets the net (a sale against a receivable, a purchase against a payable) */
  hedged: Record<FxBucket, number>;
  receivables: number;
  payables: number;
  /** open items, in rupees at the closing rate */
  receivablesInr: number;
  payablesInr: number;
  unrealised: number;
  forwardMtm: number;
}

const zero = (): Record<FxBucket, number> => ({ overdue: 0, "0-30": 0, "31-60": 0, "61-90": 0, "91+": 0 });

export function exposureByCurrency(asOf: IsoDate = WORLD.asOf): CurrencyExposure[] {
  const rows = new Map<string, CurrencyExposure>();
  const row = (c: string): CurrencyExposure => {
    let r = rows.get(c);
    if (!r) {
      r = { currency: c, rate: closingRate(c, asOf), net: zero(), hedged: zero(), receivables: 0, payables: 0, receivablesInr: 0, payablesInr: 0, unrealised: 0, forwardMtm: 0 };
      rows.set(c, r);
    }
    return r;
  };
  for (const i of fxItems(asOf)) {
    const r = row(i.currency);
    const signed = i.side === "receivable" ? i.fx : -i.fx;
    r.net[i.bucket] += signed;
    if (i.side === "receivable") {
      r.receivables += i.fx;
      r.receivablesInr += i.revalued;
    } else {
      r.payables += i.fx;
      r.payablesInr += i.revalued;
    }
    r.unrealised += i.unrealised;
  }
  for (const f of WORLD.forwards) {
    if (f.maturity < asOf) continue;
    const r = row(f.currency);
    const b = bucketOfDays(daysBetween(asOf, f.maturity));
    r.hedged[b] += f.direction === "Sell" ? f.amountFx : -f.amountFx;
    r.forwardMtm += forwardMtm(f, r.rate);
  }
  return [...rows.values()].sort((a, b) => b.receivablesInr + b.payablesInr - (a.receivablesInr + a.payablesInr));
}

/** How much of what is open in a bucket a forward covers: the forward's size against the net, from 0 up, whichever way it points. */
export function coverage(net: number, hedged: number): number | null {
  if (Math.abs(net) < 1) return null;
  // a forward only covers when it points against the exposure
  const against = Math.sign(net) === Math.sign(hedged) ? Math.min(Math.abs(hedged), Math.abs(net) * 1) : 0;
  return against / Math.abs(net);
}

export interface FxTotals {
  receivablesInr: number;
  payablesInr: number;
  netInr: number;
  unrealised: number;
  forwardMtm: number;
  /** gains and losses on receivables and payables apart */
  unrealisedReceivables: number;
  unrealisedPayables: number;
}

export function totals(items: FxItem[], rows: CurrencyExposure[]): FxTotals {
  const rec = items.filter((i) => i.side === "receivable");
  const pay = items.filter((i) => i.side === "payable");
  const sum = (xs: FxItem[], k: "revalued" | "unrealised") => xs.reduce((s, i) => s + i[k], 0);
  return {
    receivablesInr: sum(rec, "revalued"),
    payablesInr: sum(pay, "revalued"),
    netInr: sum(rec, "revalued") - sum(pay, "revalued"),
    unrealised: sum(items, "unrealised"),
    forwardMtm: rows.reduce((s, r) => s + r.forwardMtm, 0),
    unrealisedReceivables: sum(rec, "unrealised"),
    unrealisedPayables: sum(pay, "unrealised"),
  };
}

/** What the books already carry as exchange differences this year, a gain positive. */
export function realisedInLedger(asOf: IsoDate = WORLD.asOf): number {
  const gains = WORLD.glAccounts.filter((g) => g.gl === "462100").map((g) => g.gl);
  const losses = WORLD.glAccounts.filter((g) => g.gl === "531700").map((g) => g.gl);
  const from = `${asOf.slice(0, 4)}-01-01`;
  let s = 0;
  for (const l of WORLD.lines) {
    if (l.postingDate < from || l.postingDate > asOf) continue;
    if (gains.includes(l.gl)) s -= l.amount;
    else if (losses.includes(l.gl)) s -= l.amount;
  }
  return s;
}
