// Reference datasets loaded beside the ledger: purchase-order status (from the
// legacy purchasing module), the bank-guarantee register, the tax credit
// statement (Form 26AS) and month-end FX rates.

import type { BankGuarantee, FxRate, IsoDate, PurchaseOrderStatus, TaxCreditStatementLine } from "@/types";
import { addDays, daysBetween, fiscalQuarterLabel, monthEnd } from "@/lib/dates";
import { makeRng } from "@/data/rng";
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
  }
  return all.sort((a, b) => a.validTo.localeCompare(b.validTo));
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
