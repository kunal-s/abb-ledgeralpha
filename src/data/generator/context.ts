// Shared generator context: the builder, master data, and the small helpers
// every population generator uses (ages, profit centres, PO numbers, FX).

import type { BankGuarantee, IsoDate, Party, Project, PurchaseOrderStatus } from "@/types";
import { addDays, daysBetween } from "@/lib/dates";
import type { Rng } from "@/data/rng";
import type { LedgerBuilder, Leg } from "@/data/generator/builder";
import type { Masters } from "@/data/generator/masters";
import { WORLD_SPEC as S, type ProfitCentreSpec } from "@/data/workspace/spec";

/**
 * Weights for the 0–90 / 91–180 / 181–365 / over-365-day buckets, then how far back (in days) the
 * over-a-year tail reaches. A company with a year-end audit and a working review clears most items
 * before their second year end, so only a thin tail survives; the stories that are older on purpose
 * are planted (src/data/workspace/scenarios.ts). Withholding tax credits age by tax year and keep
 * a longer tail.
 */
export type AgeProfile = readonly [number, number, number, number, number];

export const PROFILES = {
  recent: [0.82, 0.12, 0.05, 0.01, 450],
  moderate: [0.76, 0.15, 0.08, 0.01, 500],
  aged: [0.56, 0.22, 0.17, 0.05, 640],
  tds: [0.38, 0.28, 0.25, 0.09, 1100],
  /** goods receipts: most are invoiced within weeks; what waits longer is the review's work */
  grir: [0.92, 0.06, 0.017, 0.003, 420],
} as const satisfies Record<string, AgeProfile>;

const BANK_CODES: Record<string, string> = {
  "HDFC Bank": "HDFC",
  "ICICI Bank": "ICICI",
  "State Bank of India": "SBI",
  "Axis Bank": "AXIS",
  "Citibank N.A.": "CITI",
  "Deutsche Bank AG": "DB",
  HSBC: "HSBC",
};

export interface PoTrack {
  po: string;
  item: number;
  vendorId: string;
  grDates: IsoDate[];
  invoiceDates: IsoDate[];
  advanceDate?: IsoDate;
  /** set by planted scenarios; otherwise derived */
  status?: PurchaseOrderStatus["status"];
}

export interface TdsRecord {
  lineKey: string;
  customerId: string;
  date: IsoDate;
  taxable: number;
  tds: number;
  nature: string;
  /** planted scenarios force an outcome in the tax credit statement */
  forced?: "missing";
}

export interface Ctx {
  rng: Rng;
  b: LedgerBuilder;
  m: Masters;
  asOf: IsoDate;
  maxAge: number;
  reserved: Set<string>;
  pcById: Map<string, ProfitCentreSpec>;
  po: Map<string, PoTrack>;
  tds: TdsRecord[];
  bankGuarantees: BankGuarantee[];
  vendorExpenseGl: Map<string, string>;
  projectsByCustomer: Map<string, Project[]>;
  anchors: Record<string, string[]>;
  nextPo: () => string;
  nextInvoiceRef: (pcId: string, date: IsoDate) => string;
  nextBgNo: (bank: string, date: IsoDate) => string;
}

export function createContext(rng: Rng, b: LedgerBuilder, m: Masters, reserved: Set<string>): Ctx {
  const pcById = new Map(S.profitCentres.map((p) => [p.id, p as ProfitCentreSpec]));
  const vendorExpenseGl = new Map<string, string>();
  for (const v of m.vendors) {
    const product = S.vendors.domesticProducts.find((p) => v.name.endsWith(p.name));
    vendorExpenseGl.set(v.id, product?.expenseGl ?? "510100");
  }
  const projectsByCustomer = new Map<string, Project[]>();
  for (const p of m.projects) {
    if (reserved.has(p.wbs)) continue;
    const list = projectsByCustomer.get(p.customerId) ?? [];
    list.push(p);
    projectsByCustomer.set(p.customerId, list);
  }
  let poSeq = 4500100000;
  const invSeq = new Map<string, number>();
  const bgSeq = new Map<string, number>();
  return {
    rng,
    b,
    m,
    asOf: S.asOf,
    maxAge: daysBetween("2022-01-03", S.asOf),
    reserved,
    pcById,
    po: new Map(),
    tds: [],
    bankGuarantees: [],
    vendorExpenseGl,
    projectsByCustomer,
    anchors: {},
    nextPo: () => {
      poSeq += rng.int(3, 61);
      return String(poSeq);
    },
    // the reference carries the two-letter business unit code, so the sequence runs per code and year: references are unique
    nextInvoiceRef: (pcId, date) => {
      const code = pcId.slice(3, 5);
      const k = `${code}-${date.slice(0, 4)}`;
      const n = (invSeq.get(k) ?? 0) + 1;
      invSeq.set(k, n);
      return `${code}/${date.slice(0, 4)}/${String(n).padStart(5, "0")}`;
    },
    nextBgNo: (bank, date) => {
      const code = BANK_CODES[bank] ?? bank.split(" ")[0].toUpperCase().slice(0, 5);
      const k = `${code}-${date.slice(0, 4)}`;
      const n = (bgSeq.get(k) ?? 0) + 1;
      bgSeq.set(k, n);
      return `${code}/BG/${date.slice(0, 4)}/${String(n * 7 + 100).padStart(5, "0")}`;
    },
  };
}

/** Age in days drawn from a profile; the over-365 tail thins out towards the profile's reach. */
export function pickAge(ctx: Ctx, profile: AgeProfile, cap?: number): number {
  const { rng } = ctx;
  const max = Math.min(cap ?? ctx.maxAge, ctx.maxAge);
  const bucket = rng.weighted(profile.slice(0, 4).map((w, i) => ({ value: i, weight: w })));
  const ranges: [number, number][] = [
    [0, 90],
    [91, 180],
    [181, 365],
    [366, Math.min(profile[4], ctx.maxAge)],
  ];
  const [lo, hi] = ranges[bucket];
  const span = hi - lo;
  const age = bucket === 3 ? lo + Math.floor(span * rng.next() ** 2) : lo + Math.floor(span * rng.next());
  return Math.min(age, max);
}

export function dateForAge(ctx: Ctx, age: number): IsoDate {
  return addDays(ctx.asOf, -age);
}

/** Business-hours entry time, "14:07". */
export function bizTime(ctx: Ctx): string {
  const h = ctx.rng.int(9, 19);
  const m = ctx.rng.int(0, 59);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function pickPc(ctx: Ctx, filter?: (p: ProfitCentreSpec) => boolean): ProfitCentreSpec {
  const list = S.profitCentres.filter((p) => !filter || filter(p));
  return ctx.rng.weighted(list.map((p) => ({ value: p as ProfitCentreSpec, weight: p.weight })));
}

/** A domestic revenue account for the profit centre (exports excluded). */
export function revenueGl(ctx: Ctx, pc: ProfitCentreSpec): string {
  const domestic = pc.revenue.filter((r) => r.gl !== "410400");
  return ctx.rng.weighted(domestic.map((r) => ({ value: r.gl, weight: r.share })));
}

export function domesticCustomers(ctx: Ctx): Party[] {
  return ctx.m.customers.filter((c) => c.country === "IN" && !ctx.reserved.has(c.id));
}

export function domesticVendors(ctx: Ctx, opts: { msme?: boolean } = {}): Party[] {
  return ctx.m.vendors.filter(
    (v) =>
      v.country === "IN" &&
      !ctx.reserved.has(v.id) &&
      (opts.msme === undefined || Boolean(v.msme && v.msme !== "Medium") === opts.msme)
  );
}

export function foreignVendors(ctx: Ctx): Party[] {
  return ctx.m.vendors.filter((v) => v.country !== "IN" && !ctx.reserved.has(v.id));
}

/** GST legs on a taxable value: IGST inter-state, CGST + SGST intra-state. */
export function gstLegs(taxable: number, side: "output" | "input", interstate: boolean, pc: string): Leg[] {
  const g = Math.round(taxable * 0.18);
  const sign = side === "output" ? -1 : 1;
  if (interstate) return [{ gl: side === "output" ? "241600" : "162300", amount: sign * g, pc }];
  const half = Math.round(g / 2);
  return [
    { gl: side === "output" ? "241400" : "162100", amount: sign * half, pc },
    { gl: side === "output" ? "241500" : "162200", amount: sign * (g - half), pc },
  ];
}

/** INR per unit of currency on a date (month-end table, drifted back for older dates). */
export function fxRateAt(currency: string, date: IsoDate): number {
  const table = S.fx[currency];
  if (!table) return 1;
  // table index 0 = Dec-2025, 1 = Jan-2026 … 9 = Sep-2026
  const months = (Number(date.slice(0, 4)) - 2025) * 12 + Number(date.slice(5, 7)) - 12;
  if (months >= 0) return table[Math.min(months, table.length - 1)];
  return Math.round(table[0] * (1 + months * 0.0025) * 100) / 100;
}

/** Record a PO line's activity (for the PO status extract). */
export function trackPo(ctx: Ctx, po: string, item: number, vendorId: string, patch: Partial<PoTrack> & { gr?: IsoDate; inv?: IsoDate }): PoTrack {
  const k = `${po}/${item}`;
  const t = ctx.po.get(k) ?? { po, item, vendorId, grDates: [], invoiceDates: [] };
  if (patch.gr) t.grDates.push(patch.gr);
  if (patch.inv) t.invoiceDates.push(patch.inv);
  if (patch.advanceDate) t.advanceDate = patch.advanceDate;
  if (patch.status) t.status = patch.status;
  ctx.po.set(k, t);
  return t;
}

export function anchor(ctx: Ctx, id: string, ...keys: string[]): void {
  ctx.anchors[id] = [...(ctx.anchors[id] ?? []), ...keys];
}
