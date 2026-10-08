// Reference datasets loaded beside the ledger: purchase-order status (from the
// legacy purchasing module), the bank-guarantee register, the tax credit
// statement (Form 26AS) and month-end FX rates.

import type { BankGuarantee, ForwardContract, FxRate, GstReturn, GstStatementLine, LineItem, IsoDate, PurchaseOrderStatus, TaxCreditStatementLine } from "@/types";
import { addDays, daysBetween, fiscalQuarterLabel, monthEnd } from "@/lib/dates";
import { makeRng } from "@/data/rng";
import { isOpenAt } from "@/data/quality";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import type { Ctx } from "@/data/generator/context";

const latest = (dates: IsoDate[]) => (dates.length ? dates.reduce((a, b) => (a > b ? a : b)) : undefined);

export function buildPurchaseOrders(ctx: Ctx): PurchaseOrderStatus[] {
  const rng = makeRng(S.seed + 3);
  return [...ctx.po.values()]
    .sort((a, b) => (a.po === b.po ? a.item - b.item : a.po.localeCompare(b.po)))
    .map((t) => {
      const lastGr = latest(t.grDates);
      const lastInv = latest(t.invoiceDates);
      let status = t.status;
      if (!status) {
        const lastActivity = latest([...t.grDates, ...t.invoiceDates, ...(t.advanceDate ? [t.advanceDate] : [])]) ?? ctx.asOf;
        const idle = daysBetween(lastActivity, ctx.asOf);
        status = idle > 365 ? (rng.chance(0.45) ? "Closed" : "Open") : "Open";
        if (status === "Closed" && rng.chance(0.08)) status = "Deletion flagged";
      }
      return {
        po: t.po,
        item: t.item,
        vendorId: t.vendorId,
        status,
        lastGrDate: lastGr,
        lastInvoiceDate: lastInv,
        sourceSystem: "Legacy SAP",
      };
    });
}

/** Guarantees issued to customers on projects and tenders, plus those received from vendors. */
export function buildBankGuarantees(ctx: Ctx): BankGuarantee[] {
  const rng = makeRng(S.seed + 5);
  const issued: BankGuarantee[] = [];
  const projects = ctx.m.projects.filter((p) => !ctx.reserved.has(p.wbs));
  for (const p of projects) {
    if (!rng.chance(0.3)) continue;
    const bank = rng.pick(S.banks.slice(0, 5));
    const start = p.startDate;
    const kinds: BankGuarantee["type"][] = [];
    if (p.stage === "Execution") kinds.push(rng.chance(0.6) ? "Performance" : "Advance payment");
    else if (p.stage === "Commissioned" || p.stage === "In DLP") kinds.push(rng.chance(0.7) ? "Performance" : "Warranty");
    else if (p.stage === "DLP ended" || p.stage === "Closed") kinds.push(rng.chance(0.6) ? "Performance" : "Retention");
    else kinds.push("Performance");
    for (const type of kinds) {
      const share = type === "Advance payment" ? 0.1 : type === "Warranty" || type === "Retention" ? 0.05 : 0.1;
      const amount = Math.round((p.contractValue * share) / 1000) * 1000;
      const validTo =
        p.stage === "Execution" ? addDays(ctx.asOf, rng.int(90, 700))
        : p.stage === "Commissioned" || p.stage === "In DLP" ? addDays(p.dlpEnd ?? ctx.asOf, rng.int(0, 120))
        : p.stage === "On hold" ? addDays(ctx.asOf, rng.int(20, 300))
        : addDays(p.dlpEnd ?? ctx.asOf, rng.int(-60, 90));
      const claimExpiry = rng.chance(0.7) ? addDays(validTo, rng.pick([90, 180, 365])) : undefined;
      issued.push({
        bgNo: ctx.nextBgNo(bank, start),
        direction: "Issued",
        type,
        partyId: p.customerId,
        bank,
        amount,
        issueDate: addDays(start, rng.int(5, 40)),
        validTo,
        claimExpiry,
        linkedWbs: p.wbs,
        status: "Active",
      });
    }
  }
  // Earnest-money guarantees for open tenders
  const customers = ctx.m.customers.filter((c) => c.country === "IN" && c.governmentOrPsu);
  for (let i = 0; i < 6; i++) {
    const bank = rng.pick(S.banks.slice(0, 4));
    const issueDate = addDays(ctx.asOf, -rng.int(20, 160));
    issued.push({
      bgNo: ctx.nextBgNo(bank, issueDate),
      direction: "Issued",
      type: "Bid / EMD",
      partyId: rng.pick(customers).id,
      bank,
      amount: rng.money(48_00_000, 0.6, 5_00_000, 2_50_00_000),
      issueDate,
      validTo: addDays(issueDate, 180),
      status: "Active",
    });
  }

  const all = [...issued, ...ctx.bankGuarantees];
  // status from dates (planted guarantees keep theirs)
  for (const bg of all) {
    if (bg.validTo >= ctx.asOf) bg.status = "Active";
    else if (bg.claimExpiry && bg.claimExpiry >= ctx.asOf) bg.status = "In claim period";
    else bg.status = rng.chance(0.3) ? "Expired - original awaited" : "Released";
    // a guarantee issued in the last two months has not yet been accepted by the customer; planted ones keep theirs
    if (bg.direction === "Issued" && !bg.acceptance) bg.acceptance = bg.issueDate > addDays(ctx.asOf, -60) ? "Pending" : "Accepted";
  }
  return all.sort((a, b) => a.validTo.localeCompare(b.validTo));
}

/** Monetary accounts whose foreign-currency balances are revalued: receivables, group receivables, payables, group payables. */
export const FX_MONETARY_GLS = new Set(["140200", "140300", "164100", "210200", "210300", "251100"]);

/**
 * Forward contracts covering part of what falls due in the next ninety days, bought for a net payable and sold
 * for a net receivable, a bucket at a time. The planted EUR payable has its own forward (S-21).
 */
export function buildForwards(ctx: Ctx, fxRates: FxRate[]): ForwardContract[] {
  const rng = makeRng(S.seed + 17);
  const spot = new Map(fxRates.filter((r) => r.periodEnd === ctx.asOf).map((r) => [r.currency, r.closing]));
  const net = new Map<string, number[]>();
  for (const l of ctx.b.lines) {
    if (l.docCurrency === "INR" || !FX_MONETARY_GLS.has(l.gl) || !isOpenAt(l, ctx.asOf) || !l.dueDate) continue;
    const d = daysBetween(ctx.asOf, l.dueDate);
    if (d < 0 || d > 90) continue;
    const arr = net.get(l.docCurrency) ?? [0, 0, 0];
    arr[d <= 30 ? 0 : d <= 60 ? 1 : 2] += l.amountDoc;
    net.set(l.docCurrency, arr);
  }
  const banks = S.banks.slice(0, 4);
  const out: ForwardContract[] = [];
  let n = 0;
  const push = (currency: string, direction: "Buy" | "Sell", amountFx: number, rate: number, maturity: IsoDate, tradeDate: IsoDate) => {
    const bank = rng.pick(banks);
    out.push({ id: `FWD-${tradeDate.slice(0, 4)}-${String(++n).padStart(3, "0")}`, bank, currency, direction, amountFx, rate, tradeDate, maturity });
  };
  for (const [ccy, buckets] of [...net.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const s = spot.get(ccy);
    if (!s) continue;
    buckets.forEach((v, k) => {
      if (Math.abs(v) < 1000) return;
      const cover = rng.range(0.55, 0.85);
      const premium = ccy === "USD" || ccy === "CNY" ? rng.range(0.003, 0.009) : rng.range(-0.004, 0.004);
      const amount = Math.round((Math.abs(v) * cover) / 1000) * 1000;
      const maturity = addDays(ctx.asOf, (k + 1) * 30 - rng.int(0, 8));
      push(ccy, v > 0 ? "Sell" : "Buy", amount, Math.round(s * (1 + premium) * 100) / 100, maturity, addDays(ctx.asOf, -rng.int(20, 120)));
    });
  }
  // S-21: EUR 5,00,000 payable booked at 96.00 and covered by a forward bought at 96.40
  push("EUR", "Buy", 5_00_000, 96.4, "2026-10-30", "2026-08-03");
  return out.sort((a, b) => a.maturity.localeCompare(b.maturity) || a.id.localeCompare(b.id));
}

/** Input credit accounts, by the tax they carry. */
export const GST_INPUT = { igst: "162300", cgst: "162100", sgst: "162200" } as const;

/**
 * The inward supply statement as the suppliers' returns reported it, and the company's own monthly returns.
 * Most supplier invoices in the books appear in the statement as booked; a few appear with different tax, a few
 * do not appear because the supplier has not filed, and a few supplies appear that the books do not have. The three
 * planted invoices (S-23) are the ones left out of the statement on purpose.
 */
export function buildGst(ctx: Ctx): { gstStatement: GstStatementLine[]; gstReturns: GstReturn[] } {
  const rng = makeRng(S.seed + 19);
  const planted = new Set(ctx.anchors["S-23"] ?? []);
  const parties = new Map(ctx.m.parties.map((p) => [p.id, p]));
  const from = `${ctx.asOf.slice(0, 4)}-01-01`;
  const docs = new Map<string, LineItem[]>();
  for (const l of ctx.b.lines) {
    if (l.docType !== "KR") continue;
    const k = `${l.fiscalYear}-${l.docNo}`;
    const list = docs.get(k);
    if (list) list.push(l);
    else docs.set(k, [l]);
  }
  const legs = new Set<string>(Object.values(GST_INPUT));
  const out: GstStatementLine[] = [];
  let n = 0;
  const line = (supplierId: string, gstin: string, ref: string, date: IsoDate, taxable: number, igst: number, cgst: number, sgst: number) =>
    out.push({ id: `2B-${String(++n).padStart(6, "0")}`, period: date.slice(0, 7), supplierId, supplierGstin: gstin, invoiceRef: ref, invoiceDate: date, taxable, igst, cgst, sgst });

  for (const [, lines] of [...docs.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ap = lines.find((l) => l.gl === "210100" && l.partner?.type === "Vendor");
    if (!ap || ap.postingDate < from || !ap.reference || planted.has(ap.key)) continue;
    const taxLines = lines.filter((l) => legs.has(l.gl));
    if (!taxLines.length) continue;
    const gstin = parties.get(ap.partner!.id)?.indirectTaxIdMasked;
    if (!gstin) continue;
    const sum = (gl: string) => taxLines.filter((l) => l.gl === gl).reduce((s, l) => s + l.amount, 0);
    const taxable = lines.filter((l) => l.gl !== "210100" && !legs.has(l.gl)).reduce((s, l) => s + l.amount, 0);
    const outcome = rng.weighted([{ value: "matched", weight: 0.92 }, { value: "different", weight: 0.05 }, { value: "missing", weight: 0.03 }]);
    if (outcome === "missing") continue;
    const k = outcome === "different" ? rng.range(0.4, 0.9) : 1;
    line(ap.partner!.id, gstin, ap.reference, ap.postingDate, taxable, Math.round(sum(GST_INPUT.igst) * k), Math.round(sum(GST_INPUT.cgst) * k), Math.round(sum(GST_INPUT.sgst) * k));
  }

  // supplies the suppliers reported that the books do not have
  const vendors = ctx.m.vendors.filter((v) => v.country === "IN" && v.indirectTaxIdMasked && !ctx.reserved.has(v.id));
  const extra = Math.round(out.length * 0.025);
  for (let i = 0; i < extra && vendors.length; i += 1) {
    const v = rng.pick(vendors);
    const date = addDays(ctx.asOf, -rng.int(1, 240));
    if (date < from) continue;
    const taxable = rng.money(9_00_000, 1.0, 20_000, 1_00_00_000);
    const g = Math.round(taxable * 0.18);
    line(v.id, v.indirectTaxIdMasked!, `${v.id.slice(5)}/${rng.int(10000, 99999)}`, date, taxable, g, 0, 0);
  }

  // the company's own returns: due on the 20th of the following month; June was filed two days late
  const returns: GstReturn[] = [];
  for (let m = 1; m <= Number(ctx.asOf.slice(5, 7)); m += 1) {
    const period = `${ctx.asOf.slice(0, 4)}-${String(m).padStart(2, "0")}`;
    const next = m === 12 ? `${Number(ctx.asOf.slice(0, 4)) + 1}-01` : `${ctx.asOf.slice(0, 4)}-${String(m + 1).padStart(2, "0")}`;
    const dueDate = `${next}-20`;
    const filedOn = dueDate <= ctx.asOf ? addDays(dueDate, period.endsWith("-06") ? 2 : -rng.int(0, 4)) : undefined;
    returns.push({ period, dueDate, filedOn });
  }
  return { gstStatement: out.sort((a, b) => a.period.localeCompare(b.period) || a.id.localeCompare(b.id)), gstReturns: returns };
}

/** Quarter end (Indian tax year quarters end Jun, Sep, Dec, Mar). */
function taxQuarterEnd(d: IsoDate): IsoDate {
  const m = Number(d.slice(5, 7));
  const endMonth = Math.ceil(m / 3) * 3;
  return monthEnd(`${d.slice(0, 4)}-${String(endMonth).padStart(2, "0")}-01`);
}

/**
 * Form 26AS lines for TDS deducted by customers. A quarter appears once the
 * deductor's return has been processed (about 75 days after quarter end).
 */
export function buildTaxCredits(ctx: Ctx): TaxCreditStatementLine[] {
  const rng = makeRng(S.seed + 7);
  const out: TaxCreditStatementLine[] = [];
  const partyById = new Map(ctx.m.parties.map((p) => [p.id, p]));
  let n = 0;
  const push = (customerId: string, date: IsoDate, nature: string, paid: number, credited: number, tan?: string) => {
    const c = partyById.get(customerId)!;
    out.push({
      id: `26AS-${String(++n).padStart(5, "0")}`,
      deductorTaxIdMasked: tan ?? c.deductorIdMasked ?? "",
      customerId,
      taxYearQuarter: fiscalQuarterLabel(date, 4, "FY"),
      transactionDate: date,
      natureOfPayment: nature,
      amountPaid: paid,
      taxCredited: credited,
    });
  };
  const available = (d: IsoDate) => addDays(taxQuarterEnd(d), 75) <= ctx.asOf;

  for (const t of ctx.tds) {
    if (!available(t.date) || t.forced === "missing") continue;
    const outcome = rng.weighted([
      { value: "matched", weight: 0.83 },
      { value: "short", weight: 0.05 },
      { value: "missing", weight: 0.05 },
      { value: "wrong-quarter", weight: 0.04 },
      { value: "wrong-tan", weight: 0.03 },
    ]);
    if (outcome === "missing") continue;
    if (outcome === "short") push(t.customerId, t.date, t.nature, t.taxable, Math.round(t.tds * rng.range(0.4, 0.9)));
    else if (outcome === "wrong-tan") {
      // credited under a different deductor ID (another branch of the customer)
      const tan = partyById.get(t.customerId)?.deductorIdMasked ?? "";
      push(t.customerId, t.date, t.nature, t.taxable, t.tds, tan ? `${tan.slice(0, -1)}${tan.endsWith("Q") ? "R" : "Q"}` : tan);
    } else if (outcome === "wrong-quarter") {
      const shifted = addDays(taxQuarterEnd(t.date), rng.int(5, 40));
      push(t.customerId, available(shifted) ? shifted : t.date, t.nature, t.taxable, t.tds);
    } else push(t.customerId, t.date, t.nature, t.taxable, t.tds);
  }

  // credits reported by customers that were never booked as receivable
  const customers = ctx.m.customers.filter((c) => c.country === "IN");
  for (let i = 0; i < 24; i++) {
    const date = addDays(ctx.asOf, -rng.int(100, 700));
    if (!available(date)) continue;
    const paid = rng.money(18_00_000, 0.9, 1_00_000, 2_00_00_000);
    push(rng.pick(customers).id, date, "Contract work", paid, Math.round(paid * 0.02));
  }
  return out.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate));
}

export function buildFxRates(): FxRate[] {
  const periods = ["2025-12-31", "2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"];
  const out: FxRate[] = [];
  for (const [currency, closes] of Object.entries(S.fx)) {
    closes.forEach((closing, i) => {
      const prev = i === 0 ? closing : closes[i - 1];
      out.push({ currency, periodEnd: periods[i], closing, average: Math.round(((prev + closing) / 2) * 100) / 100 });
    });
  }
  return out;
}
