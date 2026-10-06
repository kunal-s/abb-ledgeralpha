// Items open at the previous quarter end and settled during the quarter. The
// open-item population only contains what is still open at the period end; a
// real ledger also carries what was open in June and cleared by September.
// Without these, balances would appear to leap between quarters. Sized per
// category so the quarter's growth stays plausible (about +5%).

import type { IsoDate, LineItem } from "@/types";
import { addDays, daysBetween } from "@/lib/dates";
import { TENANT } from "@/config/tenant";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { bizTime, domesticCustomers, domesticVendors, pickPc, trackPo, type Ctx } from "@/data/generator/context";
import {
  payVendor, postCustomerInvoice, postGoodsReceipt, postInvoiceReceipt, postReceiptWithTds, vendorInvoice,
} from "@/data/generator/population";

const U = S.systemUsers;
const GROWTH = 0.05;

/** A date in the quarter before the review date. */
const priorQuarterDate = (ctx: Ctx, prior: IsoDate): IsoDate => addDays(prior, -ctx.rng.int(2, 88));
/** A settlement date after the review date and not after the period end. */
const settleDate = (ctx: Ctx, prior: IsoDate, notBefore: IsoDate): IsoDate => {
  const latest = daysBetween(prior, ctx.asOf);
  const d = addDays(prior, ctx.rng.int(3, Math.max(4, latest - 1)));
  return d > notBefore ? d : addDays(notBefore, 5);
};

export function generateSettled(ctx: Ctx): void {
  const { rng, b } = ctx;
  const prior = TENANT.priorReviewDate;

  const openGross = (gls: string[], sign: 1 | -1, after?: IsoDate) =>
    b.lines
      .filter((l) => gls.includes(l.gl) && !l.clearing && Math.sign(l.amount) === sign && (!after || l.postingDate > after))
      .reduce((s, l) => s + Math.abs(l.amount), 0);
  /** How much to settle so the category grows by about GROWTH over the quarter. */
  const target = (gls: string[], sign: 1 | -1) => Math.max(0, openGross(gls, sign, prior) - GROWTH * openGross(gls, sign));

  const clearPair = (a: LineItem, c: LineItem, date: IsoDate) => b.clear([a, c], c.docNo, date);

  // ---- trade receivables: invoiced in Q2, collected in Q3 -----------------
  const customers = domesticCustomers(ctx);
  for (let acc = 0, goal = target(["140100"], 1); acc < goal; ) {
    const customer = rng.pick(customers);
    const date = priorQuarterDate(ctx, prior);
    const inv = postCustomerInvoice(ctx, customer, date, rng.money(34_00_000, 1.05, 25_000, 24_00_00_000));
    const paid = settleDate(ctx, prior, date);
    const [, ar] = b.post({ docType: "DZ", postingDate: paid, enteredBy: U.bank, reference: inv.reference, entryTime: bizTime(ctx) }, [
      { gl: "181100", amount: inv.gross, pc: inv.line.profitCentre },
      { gl: "140100", amount: -inv.gross, pc: inv.line.profitCentre, partner: inv.line.partner, assignment: inv.reference },
    ]);
    clearPair(inv.line, ar, paid);
    acc += inv.gross;
  }

  // ---- retention: held in Q2, released in Q3 --------------------------------
  const projects = ctx.m.projects.filter((p) => !ctx.reserved.has(p.wbs) && ["Commissioned", "In DLP", "DLP ended", "Closed"].includes(p.stage));
  for (let acc = 0, goal = target(["142100"], 1); acc < goal; ) {
    const p = rng.pick(projects);
    const date = priorQuarterDate(ctx, prior);
    const amount = rng.money(16_00_000, 1.0, 50_000, 3_00_00_000);
    const [ret] = b.post({ docType: "DR", postingDate: date, enteredBy: U.billing, reference: ctx.nextInvoiceRef(p.profitCentreId, date), entryTime: bizTime(ctx) }, [
      { gl: "142100", amount, pc: p.profitCentreId, partner: { type: "Customer", id: p.customerId }, wbs: p.wbs, assignment: p.wbs, text: `Retention — ${p.name}` },
      { gl: "410200", amount: -amount, pc: p.profitCentreId, wbs: p.wbs },
    ]);
    const paid = settleDate(ctx, prior, date);
    const rel = b.post({ docType: "DZ", postingDate: paid, enteredBy: U.bank, entryTime: bizTime(ctx), text: "Retention released" }, [
      { gl: "181100", amount, pc: p.profitCentreId },
      { gl: "142100", amount: -amount, pc: p.profitCentreId, partner: ret.partner, wbs: p.wbs, assignment: p.wbs },
    ]);
    clearPair(ret, rel[1], paid);
    acc += amount;
  }

  // ---- unbilled revenue: recognised in Q2, billed (reversed) in Q3 ------------
  const live = ctx.m.projects.filter((p) => !ctx.reserved.has(p.wbs) && p.stage === "Execution");
  for (let acc = 0, goal = target(["141100", "141200"], 1); acc < goal; ) {
    const p = rng.pick(live);
    const date = priorQuarterDate(ctx, prior);
    const amount = rng.money(1_40_00_000, 0.95, 4_00_000, 25_00_00_000);
    const [rec] = b.post({ docType: "SA", postingDate: date, enteredBy: U.projects, entryTime: "02:10", text: "Revenue recognition — percentage of completion" }, [
      { gl: "141100", amount, pc: p.profitCentreId, partner: { type: "Customer", id: p.customerId }, wbs: p.wbs, assignment: p.wbs },
      { gl: "410200", amount: -amount, pc: p.profitCentreId, wbs: p.wbs },
    ]);
    const billed = settleDate(ctx, prior, date);
    const rev = b.post({ docType: "SA", postingDate: billed, enteredBy: U.projects, entryTime: "02:10", text: "Unbilled revenue transferred to billing" }, [
      { gl: "410200", amount, pc: p.profitCentreId, wbs: p.wbs },
      { gl: "141100", amount: -amount, pc: p.profitCentreId, partner: rec.partner, wbs: p.wbs, assignment: p.wbs },
    ]);
    clearPair(rec, rev[1], billed);
    acc += amount;
  }

  // ---- customer advances: received in Q2, applied to a Q3 invoice --------------
  for (let acc = 0, goal = target(["221100", "221200", "222100"], -1); acc < goal; ) {
    const customer = rng.pick(customers);
    const project = (ctx.projectsByCustomer.get(customer.id) ?? [])[0];
    const pcId = project?.profitCentreId ?? pickPc(ctx).id;
    const adv = rng.money(project ? 1_10_00_000 : 22_00_000, 1.0, 1_00_000, 20_00_00_000);
    const date = priorQuarterDate(ctx, prior);
    const [, advLine] = b.post({ docType: "DZ", postingDate: date, enteredBy: U.bank, entryTime: bizTime(ctx), text: "Advance received" }, [
      { gl: "181100", amount: adv, pc: pcId },
      { gl: "221100", amount: -adv, pc: pcId, partner: { type: "Customer", id: customer.id }, wbs: project?.wbs, assignment: project?.wbs ?? "ADVANCE" },
    ]);
    const billed = settleDate(ctx, prior, date);
    // invoice for at least the advance, then the advance is applied against it
    const inv = postCustomerInvoice(ctx, customer, billed, Math.round(adv / 1.18), { project });
    const apply = Math.min(inv.gross, adv);
    if (apply !== adv) continue; // rounding: skip rather than leave a residual
    const [adjDr, adjCr] = b.post({ docType: "AB", postingDate: billed, enteredBy: U.billing, entryTime: bizTime(ctx), text: "Down payment applied" }, [
      { gl: "221100", amount: apply, pc: pcId, partner: advLine.partner, wbs: project?.wbs, assignment: advLine.assignment },
      { gl: "140100", amount: -apply, pc: pcId, partner: advLine.partner, assignment: inv.reference },
    ]);
    clearPair(advLine, adjDr, billed);
    if (apply === inv.gross) clearPair(inv.line, adjCr, billed);
    acc += adv;
  }

  // ---- GR/IR: goods received in Q2, invoiced and paid in Q3 --------------------
  const vendors = domesticVendors(ctx, { msme: false });
  for (let acc = 0, goal = target(["211300", "211400", "211500"], -1); acc < goal; ) {
    const vendor = rng.pick(vendors);
    const grDate = priorQuarterDate(ctx, prior);
    const value = rng.money(2_80_000, 1.2, 2_000, 2_50_00_000);
    const po = ctx.nextPo();
    const gr = postGoodsReceipt(ctx, vendor, grDate, value, po, 10);
    const invDate = settleDate(ctx, prior, grDate);
    const { grirLine, apLine } = postInvoiceReceipt(ctx, vendor, invDate, value, po, 10);
    clearPair(gr, grirLine, invDate);
    const payDate = addDays(invDate, rng.int(20, 50));
    if (payDate <= ctx.asOf) payVendor(ctx, apLine, payDate);
    else payVendor(ctx, apLine, ctx.asOf);
    trackPo(ctx, po, 10, vendor.id, { status: "Closed" });
    acc += value;
  }

  // ---- trade payables: invoiced in Q2, paid in Q3 (target covers import and group payables too) ----
  for (let acc = 0, goal = target(["210100", "210200", "210300"], -1); acc < goal; ) {
    const vendor = rng.pick(vendors);
    const date = priorQuarterDate(ctx, prior);
    const ap = vendorInvoice(ctx, vendor, date, rng.money(21_00_000, 1.15, 8_000, 8_00_00_000));
    payVendor(ctx, ap, settleDate(ctx, prior, date));
    acc += Math.abs(ap.amount);
  }

  // ---- vendor advances: paid in Q2, adjusted against a Q3 invoice -----------------
  for (let acc = 0, goal = target(["151100", "151200", "151300"], 1); acc < goal; ) {
    const vendor = rng.pick(vendors);
    const advDate = priorQuarterDate(ctx, prior);
    const invDate = settleDate(ctx, prior, advDate);
    const ap = vendorInvoice(ctx, vendor, invDate, rng.money(11_00_000, 1.2, 25_000, 4_00_00_000));
    const amount = Math.abs(ap.amount);
    const po = ctx.nextPo();
    const [advLine] = b.post({ docType: "KZ", postingDate: advDate, enteredBy: "AP_SSC01", reference: po, entryTime: bizTime(ctx), text: "Advance payment against purchase order" }, [
      { gl: "151100", amount, pc: ap.profitCentre, partner: { type: "Vendor", id: vendor.id }, po: { number: po, item: 10 }, assignment: po },
      { gl: "181200", amount: -amount, pc: ap.profitCentre },
    ]);
    const [apDr, advCr] = b.post({ docType: "AB", postingDate: invDate, enteredBy: "AP_SSC01", entryTime: bizTime(ctx), text: "Advance adjusted against invoice" }, [
      { gl: "210100", amount, pc: ap.profitCentre, partner: ap.partner, assignment: ap.assignment },
      { gl: "151100", amount: -amount, pc: ap.profitCentre, partner: { type: "Vendor", id: vendor.id }, po: { number: po, item: 10 }, assignment: po },
    ]);
    clearPair(ap, apDr, invDate);
    clearPair(advLine, advCr, invDate);
    trackPo(ctx, po, 10, vendor.id, { advanceDate: advDate, gr: invDate, status: "Closed" });
    acc += amount;
  }

  // ---- receipts parked in clearing in Q2, applied in Q3 -----------------------------
  for (let acc = 0, goal = target(["171200"], -1); acc < goal; ) {
    const customer = rng.pick(customers);
    const date = priorQuarterDate(ctx, prior);
    const inv = postCustomerInvoice(ctx, customer, addDays(date, -rng.int(10, 40)), rng.money(18_00_000, 1.0, 50_000, 6_00_00_000));
    const amount = inv.gross;
    const [, park] = b.post({ docType: "DZ", postingDate: date, enteredBy: U.bank, entryTime: bizTime(ctx), text: `NEFT CR ${customer.name.split(" ")[0].toUpperCase()}` }, [
      { gl: "181100", amount, pc: inv.line.profitCentre },
      { gl: "171200", amount: -amount, pc: inv.line.profitCentre, assignment: `UTR${rng.int(100000, 999999)}` },
    ]);
    const applied = settleDate(ctx, prior, date);
    const [parkDr, arCr] = b.post({ docType: "AB", postingDate: applied, enteredBy: U.bank, entryTime: bizTime(ctx), text: "Receipt applied to customer" }, [
      { gl: "171200", amount, pc: inv.line.profitCentre },
      { gl: "140100", amount: -amount, pc: inv.line.profitCentre, partner: inv.line.partner, assignment: inv.reference },
    ]);
    clearPair(park, parkDr, applied);
    clearPair(inv.line, arCr, applied);
    acc += amount;
  }

  // ---- deposits: earnest money placed in Q2, refunded in Q3 -----------------------------
  for (let acc = 0, goal = target(["153100", "153200", "153300"], 1); acc < goal; ) {
    const customer = rng.pick(customers);
    const date = priorQuarterDate(ctx, prior);
    const amount = rng.money(4_20_000, 1.1, 10_000, 1_50_00_000);
    const pcId = pickPc(ctx).id;
    const [dep] = b.post({ docType: "SA", postingDate: date, enteredBy: "SKULKARNI", manual: true, entryTime: bizTime(ctx), text: "Earnest money deposit — tender" }, [
      { gl: "153200", amount, pc: pcId, partner: { type: "Customer", id: customer.id }, assignment: `TENDER-${rng.int(1000, 9999)}` },
      { gl: "181200", amount: -amount, pc: pcId },
    ]);
    const refunded = settleDate(ctx, prior, date);
    const [, cr] = b.post({ docType: "DZ", postingDate: refunded, enteredBy: U.bank, entryTime: bizTime(ctx), text: "Earnest money refunded" }, [
      { gl: "181100", amount, pc: pcId },
      { gl: "153200", amount: -amount, pc: pcId, partner: dep.partner, assignment: dep.assignment },
    ]);
    clearPair(dep, cr, refunded);
    acc += amount;
  }

  // ---- withholding tax receivable: deducted in Q2, claimed against tax payable in Q3 -----
  for (let acc = 0, goal = target(["161100"], 1); acc < goal; ) {
    const customer = rng.pick(customers);
    const date = priorQuarterDate(ctx, prior);
    const taxable = rng.money(24_00_000, 1.0, 60_000, 12_00_00_000);
    const { tdsLine } = postReceiptWithTds(ctx, customer, date, taxable, { rate: 0.02, nature: "Contract work" });
    const claimed = settleDate(ctx, prior, date);
    const [, cr] = b.post({ docType: "SA", postingDate: claimed, enteredBy: "LSUBRAMANIAN", manual: true, entryTime: bizTime(ctx), text: "TDS credit adjusted against income tax payable" }, [
      { gl: "241900", amount: tdsLine.amount, pc: S.corporateProfitCentre.id },
      { gl: "161100", amount: -tdsLine.amount, pc: tdsLine.profitCentre, partner: tdsLine.partner, assignment: tdsLine.assignment },
    ]);
    clearPair(tdsLine, cr, claimed);
    acc += tdsLine.amount;
  }

  // ---- capital work in progress: incurred in Q2, capitalised in Q3 ---------------------------
  for (let acc = 0, goal = target(["120100", "120200"], 1); acc < goal; ) {
    const vendor = rng.pick(vendors);
    const date = priorQuarterDate(ctx, prior);
    const value = rng.money(38_00_000, 1.1, 1_00_000, 12_00_00_000);
    const pcId = pickPc(ctx).id;
    const [auc] = b.post({ docType: "KR", postingDate: date, enteredBy: "AP_SSC01", entryTime: bizTime(ctx), text: "Capital purchase — asset under construction" }, [
      { gl: "120200", amount: value, pc: pcId, assignment: `AUC-${rng.int(40000, 49999)}` },
      { gl: "261200", amount: -value, pc: pcId, partner: { type: "Vendor", id: vendor.id }, assignment: vendor.id },
    ]);
    const capitalised = settleDate(ctx, prior, date);
    const [, cr] = b.post({ docType: "AF", postingDate: capitalised, enteredBy: U.assets, entryTime: "01:30", text: "Capitalisation of asset under construction" }, [
      { gl: "110300", amount: value, pc: pcId },
      { gl: "120200", amount: -value, pc: pcId, assignment: auc.assignment },
    ]);
    clearPair(auc, cr, capitalised);
    acc += value;
  }

  // ---- employee advances: issued in Q2, settled in Q3 --------------------------------
  for (let acc = 0, goal = target(["152100", "152200"], 1); acc < goal; ) {
    const date = priorQuarterDate(ctx, prior);
    const amount = rng.money(42_000, 0.7, 5_000, 2_50_000);
    const pcId = pickPc(ctx).id;
    const [adv] = b.post({ docType: "SA", postingDate: date, enteredBy: U.travel, entryTime: bizTime(ctx) }, [
      { gl: "152100", amount, pc: pcId, assignment: `EMP-${rng.int(10000, 19999)}`, text: "Travel advance" },
      { gl: "181200", amount: -amount, pc: pcId },
    ]);
    const settled = settleDate(ctx, prior, date);
    const [, cr] = b.post({ docType: "SA", postingDate: settled, enteredBy: U.travel, entryTime: bizTime(ctx), text: "Travel claim settled" }, [
      { gl: "530400", amount, pc: pcId },
      { gl: "152100", amount: -amount, pc: pcId, assignment: adv.assignment },
    ]);
    clearPair(adv, cr, settled);
    acc += amount;
  }
}
