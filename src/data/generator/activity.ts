// Period activity: opening-balance migration, monthly business activity per
// profit centre (billing, collections, purchases, payroll, expenses,
// depreciation, provisions, accruals), and the company-level settlements that
// keep balances realistic (GST, income tax, bank funding).

import type { IsoDate, LineItem } from "@/types";
import { addDays, monthEnd, monthEndsBetween } from "@/lib/dates";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { bizTime, gstLegs, type Ctx } from "@/data/generator/context";
import type { Leg } from "@/data/generator/builder";

const U = S.systemUsers;
const CORP = S.corporateProfitCentre.id;
const AP_TEAM = "AP_SSC01";

const cr = (x: number) => Math.round(x * 1_00_00_000);
const REVENUE_GLS = new Set(["410100", "410200", "410300", "410400"]);
const GST_GLS = ["162100", "162200", "162300", "241400", "241500", "241600"];
const SEASON = S.seasonality;
const OTHER_EXPENSES: [string, number][] = [
  ["530100", 0.1], ["530200", 0.06], ["530300", 0.12], ["530400", 0.08], ["530500", 0.08], ["530600", 0.12],
  ["530700", 0.05], ["530800", 0.14], ["530900", 0.12], ["531000", 0.03], ["531900", 0.1],
];

/** Split an amount by weights; the last part absorbs rounding. */
function split(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  const parts = weights.map((w) => Math.round((total * w) / sum));
  parts[parts.length - 1] += total - parts.reduce((s, p) => s + p, 0);
  return parts;
}

// ---------------------------------------------------------------------------
// Opening balances
// ---------------------------------------------------------------------------
export function postMigration(ctx: Ctx): void {
  // jitter keeps migrated balances from looking like round estimates
  const j = (amount: number) => amount + Math.sign(amount) * ctx.rng.int(10_000, 9_99_999);
  const legs: Leg[] = (
    [
      ["110100", j(cr(48.17))], ["110200", j(cr(620.4))], ["110300", j(cr(1450.9))], ["110400", j(cr(60.3))],
      ["110500", j(cr(18.2))], ["110600", j(cr(140.6))], ["119200", j(-cr(210.5))], ["119300", j(-cr(780.8))],
      ["119600", j(-cr(110.1))], ["125100", j(cr(85.4))], ["130100", j(cr(820.7))], ["130200", j(cr(410.2))],
      ["130300", j(cr(350.9))], ["130400", j(cr(90.3))], ["181100", j(cr(1850.6))], ["181200", j(cr(900.2))],
      ["181300", j(cr(650.8))], ["181400", j(cr(120.4))], ["182100", 12_40_310], ["231400", j(-cr(160.2))],
      ["231500", j(-cr(95.6))], ["310100", -42_38_09_000], ["320200", j(-cr(1100.3))],
    ] as [string, number][]
  ).map(([gl, amount]) => ({ gl, amount, pc: CORP }));
  const plug = -legs.reduce((s, l) => s + l.amount, 0);
  legs.push({ gl: "320100", amount: plug, pc: CORP });
  ctx.b.post({ docType: "SA", postingDate: S.migrationDate, enteredBy: U.migration, text: "Opening balances - migration", entryTime: "03:00" }, legs);
}

// ---------------------------------------------------------------------------
// Monthly business activity per profit centre
// ---------------------------------------------------------------------------
function monthKey(d: IsoDate): string {
  return d.slice(0, 7);
}

export function postMonthlyActivity(ctx: Ctx): void {
  const { rng, b } = ctx;
  const accountants = { provisions: "AMALHOTRA", procurement: "RDESHPANDE" };

  // revenue and material already carried by the open-item population, per PC-month
  const popRevenue = new Map<string, number>();
  const popExport = new Map<string, number>();
  const popMaterial = new Map<string, number>();
  for (const l of b.lines) {
    const k = `${l.profitCentre}|${monthKey(l.postingDate)}`;
    if (REVENUE_GLS.has(l.gl)) {
      const map = l.gl === "410400" ? popExport : popRevenue;
      map.set(k, (map.get(k) ?? 0) - l.amount);
    } else if (l.gl === "510100") {
      popMaterial.set(k, (popMaterial.get(k) ?? 0) + l.amount);
    }
  }

  const months = monthEndsBetween(S.activityFrom, ctx.asOf);
  for (const e of months) {
    const year = Number(e.slice(0, 4));
    const month = Number(e.slice(5, 7));
    const next = addDays(e, 1);
    const yearFactor = year < 2026 ? 1 / (1 + S.growth) : 1;
    let companySalary = 0;
    let companyRevenue = 0;

    for (const pc of S.profitCentres) {
      const k = `${pc.id}|${monthKey(e)}`;
      const R = Math.round(S.monthlyRevenue2026 * pc.weight * SEASON[month - 1] * yearFactor * rng.range(0.95, 1.05));
      companyRevenue += R;
      const exportShare = pc.revenue.find((r) => r.gl === "410400")?.share ?? 0;

      // Domestic billing and collection (summarised per month)
      const domTarget = R * (1 - exportShare);
      const T = Math.round(Math.max(domTarget - (popRevenue.get(k) ?? 0), 0.25 * domTarget));
      const domestic = pc.revenue.filter((r) => r.gl !== "410400");
      const revParts = split(T, domestic.map((r) => r.share));
      const igstBase = Math.round(T * 0.6);
      const gst = [...gstLegs(igstBase, "output", true, pc.id), ...gstLegs(T - igstBase, "output", false, pc.id)];
      const G = T - gst.reduce((s, l) => s + l.amount, 0);
      const [arBill] = b.post({ docType: "DR", postingDate: e, enteredBy: U.billing, text: `Billing summary - ${pc.name}`, entryTime: "23:15" }, [
        { gl: "140100", amount: G, pc: pc.id, assignment: `SUMMARY-${monthKey(e)}` },
        ...domestic.map((r, i) => ({ gl: r.gl, amount: -revParts[i], pc: pc.id })),
        ...gst,
      ]);
      const coll = b.post({ docType: "DZ", postingDate: e, enteredBy: U.bank, text: `Collections summary - ${pc.name}`, entryTime: "23:40" }, [
        { gl: "181100", amount: G, pc: pc.id },
        { gl: "140100", amount: -G, pc: pc.id, assignment: `SUMMARY-${monthKey(e)}` },
      ]);
      b.clear([arBill, coll[1]], coll[1].docNo, e);

      if (exportShare > 0) {
        const expTarget = R * exportShare;
        const E = Math.round(Math.max(expTarget - (popExport.get(k) ?? 0), 0.25 * expTarget));
        const [exBill] = b.post({ docType: "DR", postingDate: e, enteredBy: U.billing, text: `Export billing summary - ${pc.name}`, entryTime: "23:16" }, [
          { gl: "140200", amount: E, pc: pc.id, assignment: `SUMMARY-${monthKey(e)}`, docCurrency: "USD", amountDoc: Math.round((E / 83.3) * 100) / 100 },
          { gl: "410400", amount: -E, pc: pc.id },
        ]);
        const exColl = b.post({ docType: "DZ", postingDate: e, enteredBy: U.bank, text: `Export collections summary - ${pc.name}`, entryTime: "23:41" }, [
          { gl: "181400", amount: E, pc: pc.id },
          { gl: "140200", amount: -E, pc: pc.id, assignment: `SUMMARY-${monthKey(e)}` },
        ]);
        b.clear([exBill, exColl[1]], exColl[1].docNo, e);
      }

      // Material purchases and payments
      const mTarget = R * pc.materialRatio * rng.range(0.97, 1.03);
      const M = Math.round(Math.max(mTarget - (popMaterial.get(k) ?? 0), 0.2 * mTarget));
      payableCycle(ctx, e, pc.id, [["510100", M]], `Purchases summary - ${pc.name}`);

      // Other expenses
      const O = Math.round(R * rng.range(0.11, 0.135));
      const oParts = split(O, OTHER_EXPENSES.map(([, w]) => w));
      payableCycle(ctx, e, pc.id, OTHER_EXPENSES.map(([gl], i) => [gl, oParts[i]] as [string, number]), `Expenses summary - ${pc.name}`);

      // Payroll; statutory deductions deposited on the 7th of the next month
      const Sal = Math.round(R * rng.range(0.072, 0.088));
      companySalary += Sal;
      const pfEr = Math.round(Sal * 0.048);
      const pfEe = Math.round(Sal * 0.048);
      const tds = Math.round(Sal * 0.105);
      const payroll = b.post({ docType: "PR", postingDate: e, enteredBy: U.payroll, text: `Payroll - ${pc.name}`, entryTime: "22:30" }, [
        { gl: "520100", amount: Sal, pc: pc.id },
        { gl: "520200", amount: pfEr, pc: pc.id },
        { gl: "241300", amount: -tds, pc: pc.id, assignment: `TDS-SAL-${monthKey(e)}` },
        { gl: "241700", amount: -(pfEe + pfEr), pc: pc.id, assignment: `PF-${monthKey(e)}` },
        { gl: "181300", amount: -(Sal - pfEe - tds), pc: pc.id },
      ]);
      const depositDate = addDays(next, 6);
      if (depositDate <= ctx.asOf) {
        const dep = b.post({ docType: "ZP", postingDate: depositDate, enteredBy: U.bank, text: `Statutory deposit - ${monthKey(e)}`, entryTime: "11:30" }, [
          { gl: "241300", amount: tds, pc: pc.id, assignment: `TDS-SAL-${monthKey(e)}` },
          { gl: "241700", amount: pfEe + pfEr, pc: pc.id, assignment: `PF-${monthKey(e)}` },
          { gl: "181300", amount: -(tds + pfEe + pfEr), pc: pc.id },
        ]);
        b.clear([payroll[2], payroll[3], dep[0], dep[1]], dep[0].docNo, depositDate);
      }

      // Depreciation
      const D = Math.round(R * 0.017);
      const dParts = split(D, [0.7, 0.18, 0.12]);
      b.post({ docType: "AF", postingDate: e, enteredBy: U.assets, text: "Depreciation run", entryTime: "01:30" }, [
        { gl: "540100", amount: D, pc: pc.id },
        { gl: "119300", amount: -dParts[0], pc: pc.id },
        { gl: "119200", amount: -dParts[1], pc: pc.id },
        { gl: "119600", amount: -dParts[2], pc: pc.id },
      ]);

      // Warranty provision (monthly) and utilisation (quarter-end)
      const W = Math.round(R * 0.007);
      b.post({ docType: "SA", postingDate: e, enteredBy: accountants.provisions, manual: true, entryDate: e, entryTime: bizTime(ctx), text: `Warranty provision - ${monthKey(e)}` }, [
        { gl: "531200", amount: W, pc: pc.id },
        { gl: "231100", amount: -W, pc: pc.id },
      ]);
      if (month % 3 === 0) {
        const util = Math.round(W * 3 * rng.range(0.55, 0.8));
        b.post({ docType: "SA", postingDate: e, enteredBy: accountants.provisions, manual: true, entryTime: bizTime(ctx), text: "Warranty costs utilised" }, [
          { gl: "231100", amount: util, pc: pc.id },
          { gl: "181200", amount: -util, pc: pc.id },
        ]);
      }

      // Month-end service accrual, reversed on the first of the next month
      let A = Math.round(R * rng.range(0.0035, 0.0055));
      if (rng.chance(0.35) && A > 1_00_000) A = Math.round(A / 1_00_000) * 1_00_000;
      const entryDate = addDays(e, 2) > "2026-10-01" ? "2026-10-01" : addDays(e, 2);
      b.post({ docType: "SA", postingDate: e, enteredBy: accountants.procurement, manual: true, entryDate, entryTime: bizTime(ctx), text: `Accrual - services received not invoiced, ${monthKey(e)}` }, [
        { gl: "530300", amount: A, pc: pc.id },
        { gl: "232100", amount: -A, pc: pc.id, assignment: `ACR-${monthKey(e)}` },
      ]);
      if (next <= ctx.asOf) {
        b.post({ docType: "SA", postingDate: next, enteredBy: accountants.procurement, manual: true, entryTime: bizTime(ctx), text: `Reversal - accrual ${monthKey(e)}` }, [
          { gl: "232100", amount: A, pc: pc.id, assignment: `ACR-${monthKey(e)}` },
          { gl: "530300", amount: -A, pc: pc.id },
        ]);
      }
    }

    // Company-level items
    const interest = Math.round(cr(27) * (year < 2026 ? 0.9 : 1) * rng.range(0.95, 1.05));
    b.post({ docType: "SA", postingDate: e, enteredBy: "FQURESHI", manual: true, entryTime: bizTime(ctx), text: "Interest on fixed deposits" }, [
      { gl: "181300", amount: interest, pc: CORP },
      { gl: "461100", amount: -interest, pc: CORP },
    ]);
    const gratuity = Math.round(companySalary * 0.045);
    const gParts = split(gratuity, [0.6, 0.4]);
    b.post({ docType: "SA", postingDate: e, enteredBy: accountants.provisions, manual: true, entryTime: bizTime(ctx), text: "Gratuity and leave accrual" }, [
      { gl: "520300", amount: gratuity, pc: CORP },
      { gl: "231400", amount: -gParts[0], pc: CORP },
      { gl: "231500", amount: -gParts[1], pc: CORP },
    ]);
    const charges = Math.round(cr(0.18) * rng.range(0.8, 1.2));
    b.post({ docType: "SA", postingDate: e, enteredBy: U.bank, entryTime: "06:10", text: "Bank charges" }, [
      { gl: "531100", amount: charges, pc: CORP },
      { gl: "181100", amount: -charges, pc: CORP },
    ]);
    if (month % 3 === 0) {
      const ecl = Math.round(companyRevenue * 3 * 0.0015);
      b.post({ docType: "SA", postingDate: e, enteredBy: accountants.provisions, manual: true, entryTime: bizTime(ctx), text: "Expected credit loss - provision matrix" }, [
        { gl: "531400", amount: ecl, pc: CORP },
        { gl: "149100", amount: -ecl, pc: CORP },
      ]);
      const paid = Math.round(gratuity * 3 * 0.4);
      b.post({ docType: "SA", postingDate: e, enteredBy: U.payroll, entryTime: bizTime(ctx), text: "Gratuity and leave settlements" }, [
        { gl: "231400", amount: paid, pc: CORP },
        { gl: "181300", amount: -paid, pc: CORP },
      ]);
    }
  }
}

/** Vendor invoice summary + payment, cleared against each other. */
function payableCycle(ctx: Ctx, e: IsoDate, pc: string, expenses: [string, number][], text: string): void {
  const { b } = ctx;
  const net = expenses.reduce((s, [, a]) => s + a, 0);
  const gst = gstLegs(Math.round(net * 0.8), "input", true, pc);
  const gross = net + gst.reduce((s, l) => s + l.amount, 0);
  const [ap] = b.post({ docType: "KR", postingDate: e, enteredBy: AP_TEAM, text, entryTime: "23:20" }, [
    { gl: "210100", amount: -gross, pc, assignment: `SUMMARY-${monthKey(e)}` },
    ...expenses.map(([gl, amount]) => ({ gl, amount, pc })),
    ...gst,
  ]);
  const pay = b.post({ docType: "KZ", postingDate: e, enteredBy: U.bank, text: `Payments - ${text}`, entryTime: "23:50" }, [
    { gl: "210100", amount: gross, pc, assignment: `SUMMARY-${monthKey(e)}` },
    { gl: "181200", amount: -gross, pc },
  ]);
  b.clear([ap, pay[0]], pay[0].docNo, e);
}

// ---------------------------------------------------------------------------
// Company-level settlements and funding
// ---------------------------------------------------------------------------
export function postSettlements(ctx: Ctx): void {
  const { b } = ctx;
  const snapshot: LineItem[] = [...b.lines];

  // GST: everything before the activity window settled in one entry; then monthly on the 20th
  const gstNet = (from: IsoDate | null, to: IsoDate) => {
    const net = new Map<string, number>(GST_GLS.map((g) => [g, 0]));
    for (const l of snapshot) {
      if (!net.has(l.gl)) continue;
      if (l.postingDate > to || (from && l.postingDate < from)) continue;
      net.set(l.gl, net.get(l.gl)! + l.amount);
    }
    return net;
  };
  const settle = (date: IsoDate, net: Map<string, number>, text: string) => {
    const legs: Leg[] = [...net.entries()].filter(([, a]) => a !== 0).map(([gl, a]) => ({ gl, amount: -a, pc: CORP }));
    const bank = -legs.reduce((s, l) => s + l.amount, 0);
    legs.push({ gl: "181300", amount: bank, pc: CORP });
    b.post({ docType: "SA", postingDate: date, enteredBy: "SKULKARNI", manual: true, entryTime: bizTime(ctx), text }, legs);
  };
  settle("2024-12-31", gstNet(null, "2024-12-31"), "GST settlement - periods up to Dec 2024");
  for (const e of monthEndsBetween(S.activityFrom, ctx.asOf)) {
    const pay = addDays(addDays(e, 1), 19);
    if (pay > ctx.asOf) continue;
    settle(pay, gstNet(`${e.slice(0, 7)}-01`, e), `GST settlement - ${e.slice(0, 7)}`);
  }

  // Current tax: monthly provision at the effective rate; advance tax on the statutory dates
  for (const e of monthEndsBetween(S.activityFrom, ctx.asOf)) {
    const from = `${e.slice(0, 7)}-01`;
    let pbt = 0;
    for (const l of b.lines) {
      if (l.postingDate < from || l.postingDate > e) continue;
      const first = l.gl[0];
      if (first === "4" || first === "5") {
        if (l.gl === "550100") continue;
        pbt -= l.amount; // income is credit (negative)
      }
    }
    if (pbt <= 0) continue;
    const tax = Math.round(pbt * 0.2517);
    b.post({ docType: "SA", postingDate: e, enteredBy: "LSUBRAMANIAN", manual: true, entryTime: bizTime(ctx), text: "Provision for current tax" }, [
      { gl: "550100", amount: tax, pc: CORP },
      { gl: "241900", amount: -tax, pc: CORP },
    ]);
    const m = Number(e.slice(5, 7));
    if ([3, 6, 9, 12].includes(m)) {
      const payDate = `${e.slice(0, 7)}-15`;
      const balance = b.lines.filter((l) => l.gl === "241900" && l.postingDate <= payDate).reduce((s, l) => s + l.amount, 0);
      if (balance < 0 && payDate <= ctx.asOf) {
        const pay = Math.round(-balance * 0.9);
        b.post({ docType: "SA", postingDate: payDate, enteredBy: "LSUBRAMANIAN", manual: true, entryTime: bizTime(ctx), text: "Advance tax paid" }, [
          { gl: "241900", amount: pay, pc: CORP },
          { gl: "181300", amount: -pay, pc: CORP },
        ]);
      }
    }
  }

  fundBankAccounts(ctx);
}

/**
 * Treasury funding: top up the payments and current accounts from the
 * collections account when they would fall below a floor, and convert surplus
 * foreign-currency receipts. Posted on the first working day of the month.
 */
function fundBankAccounts(ctx: Ctx): void {
  const { b } = ctx;
  const floor = cr(250);
  const banks = ["181100", "181200", "181300", "181400"];
  const months = monthEndsBetween("2022-01-01", ctx.asOf);
  const movement = new Map<string, number>();
  let opening = new Map<string, number>(banks.map((g) => [g, 0]));
  for (const l of b.lines) {
    if (!banks.includes(l.gl)) continue;
    const k = `${l.gl}|${monthEnd(l.postingDate)}`;
    movement.set(k, (movement.get(k) ?? 0) + l.amount);
    if (l.postingDate < "2022-01-01") opening.set(l.gl, opening.get(l.gl)! + l.amount);
  }
  for (const e of months) {
    const first = `${e.slice(0, 7)}-01`;
    const closing = new Map(banks.map((g) => [g, opening.get(g)! + (movement.get(`${g}|${e}`) ?? 0)]));
    for (const g of ["181200", "181300"]) {
      const bal = closing.get(g)!;
      if (bal < floor) {
        const top = Math.round((floor - bal + cr(150) + ctx.rng.int(0, 4_000) * 1_00_000) / 1_00_000) * 1_00_000;
        b.post({ docType: "ZP", postingDate: first, enteredBy: U.bank, entryTime: "10:15", text: "Funding transfer from collections account" }, [
          { gl: g, amount: top, pc: CORP },
          { gl: "181100", amount: -top, pc: CORP },
        ]);
        closing.set(g, bal + top);
        closing.set("181100", closing.get("181100")! - top);
      }
    }
    const eefc = closing.get("181400")!;
    if (eefc > cr(90)) {
      const conv = Math.round((eefc - cr(40) - ctx.rng.int(0, 2_500) * 1_00_000) / 1_00_000) * 1_00_000;
      b.post({ docType: "ZP", postingDate: e, enteredBy: U.bank, entryTime: "15:30", text: "Conversion of EEFC balance" }, [
        { gl: "181100", amount: conv, pc: CORP },
        { gl: "181400", amount: -conv, pc: CORP },
      ]);
      closing.set("181400", eefc - conv);
      closing.set("181100", closing.get("181100")! + conv);
    }
    opening = closing;
  }
}
