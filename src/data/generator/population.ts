// Open-item population: the balance sheet items a review, a reconciliation or
// cash application works on. Every item is posted inside a balanced document
// with realistic offsets, so balances, open items and the trial balance agree.

import type { IsoDate, LineItem, Party, Project } from "@/types";
import { addDays, fiscalQuarterLabel } from "@/lib/dates";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import {
  PROFILES,
  bizTime,
  dateForAge,
  domesticCustomers,
  domesticVendors,
  foreignVendors,
  fxRateAt,
  gstLegs,
  pickAge,
  pickPc,
  revenueGl,
  trackPo,
  type Ctx,
} from "@/data/generator/context";

const U = S.systemUsers;
const AP_TEAM = "AP_SSC01";
const N = S.openItems;

function projectFor(ctx: Ctx, customer: Party, stages?: Project["stage"][]): Project | undefined {
  const list = (ctx.projectsByCustomer.get(customer.id) ?? []).filter((p) => !stages || stages.includes(p.stage));
  return list.length ? ctx.rng.pick(list) : undefined;
}

function anyProject(ctx: Ctx, stages: Project["stage"][]): Project {
  const list = ctx.m.projects.filter((p) => !ctx.reserved.has(p.wbs) && stages.includes(p.stage));
  return ctx.rng.pick(list);
}

function partyOf(ctx: Ctx, id: string): Party {
  return ctx.m.parties.find((p) => p.id === id)!;
}

function docAmount(amountInr: number, currency: string, date: IsoDate): number {
  return Math.round((amountInr / fxRateAt(currency, date)) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Receivables
// ---------------------------------------------------------------------------
export interface CustomerInvoice {
  line: LineItem;
  customerId: string;
  taxable: number;
  gross: number;
  date: IsoDate;
  reference: string;
}

/** Domestic customer invoice; returns the AR line (open unless the caller clears it). */
export function postCustomerInvoice(
  ctx: Ctx,
  customer: Party,
  date: IsoDate,
  taxable: number,
  opts: { project?: Project; pcId?: string; dueDays?: number; text?: string } = {}
): CustomerInvoice {
  const pc = ctx.pcById.get(opts.project?.profitCentreId ?? opts.pcId ?? pickPc(ctx).id)!;
  const reference = ctx.nextInvoiceRef(pc.id, date);
  const gst = gstLegs(taxable, "output", ctx.rng.chance(0.55), pc.id);
  const gross = taxable - gst.reduce((s, l) => s + l.amount, 0);
  const [ar] = ctx.b.post(
    { docType: "DR", postingDate: date, enteredBy: U.billing, reference, entryTime: bizTime(ctx) },
    [
      {
        gl: "140100",
        amount: gross,
        pc: pc.id,
        partner: { type: "Customer", id: customer.id },
        wbs: opts.project?.wbs,
        assignment: reference,
        dueDate: addDays(date, opts.dueDays ?? ctx.rng.pick([30, 45, 60, 60, 90])),
        text: opts.text ?? (opts.project ? `Milestone billing - ${opts.project.name}` : "Supply of products"),
      },
      { gl: opts.project ? "410200" : revenueGl(ctx, pc), amount: -taxable, pc: pc.id, wbs: opts.project?.wbs },
      ...gst,
    ]
  );
  return { line: ar, customerId: customer.id, taxable, gross, date, reference };
}

function receivables(ctx: Ctx, openInvoices: CustomerInvoice[]): void {
  const { rng } = ctx;
  const customers = domesticCustomers(ctx);

  for (let i = 0; i < N.arDomestic; i++) {
    const customer = rng.pick(customers);
    const project = rng.chance(0.55) ? projectFor(ctx, customer, ["Execution", "Commissioned", "In DLP"]) : undefined;
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const taxable = rng.money(project ? 1_15_00_000 : 34_00_000, 1.05, 25_000, 24_00_00_000);
    openInvoices.push(postCustomerInvoice(ctx, customer, date, taxable, { project }));
  }

  const exportCustomers = ctx.m.customers.filter((c) => c.country !== "IN");
  for (let i = 0; i < N.arExport; i++) {
    const customer = rng.pick(exportCustomers);
    const pc = pickPc(ctx, (p) => p.revenue.some((r) => r.gl === "410400"));
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const amount = rng.money(42_00_000, 0.9, 1_00_000, 8_00_00_000);
    const reference = ctx.nextInvoiceRef(pc.id, date);
    ctx.b.post({ docType: "DR", postingDate: date, enteredBy: U.billing, reference, entryTime: bizTime(ctx) }, [
      {
        gl: "140200",
        amount,
        pc: pc.id,
        partner: { type: "Customer", id: customer.id },
        assignment: reference,
        docCurrency: "USD",
        amountDoc: docAmount(amount, "USD", date),
        dueDate: addDays(date, 90),
        text: "Export supply",
      },
      { gl: "410400", amount: -amount, pc: pc.id },
    ]);
  }

  for (let i = 0; i < N.arGroup; i++) {
    const gc = rng.pick(ctx.m.groupCompanies);
    const pc = pickPc(ctx);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const amount = rng.money(28_00_000, 1.0, 50_000, 6_00_00_000);
    const reference = ctx.nextInvoiceRef(pc.id, date);
    ctx.b.post({ docType: "DR", postingDate: date, enteredBy: U.billing, reference, entryTime: bizTime(ctx) }, [
      {
        gl: "140300",
        amount,
        pc: pc.id,
        partner: { type: "Group company", id: gc.id },
        assignment: reference,
        docCurrency: gc.currency,
        amountDoc: docAmount(amount, gc.currency!, date),
        dueDate: addDays(date, 60),
        text: rng.chance(0.6) ? "Export of components to group company" : "Engineering services to group company",
      },
      { gl: rng.chance(0.6) ? "410400" : "410300", amount: -amount, pc: pc.id },
    ]);
  }

  // Retention money held back on project billing
  for (let i = 0; i < N.retention; i++) {
    const project = anyProject(ctx, ["Commissioned", "In DLP", "DLP ended", "Closed", "Execution"]);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.aged));
    const amount = rng.money(16_00_000, 1.0, 50_000, 3_00_00_000);
    ctx.b.post({ docType: "DR", postingDate: date, enteredBy: U.billing, reference: ctx.nextInvoiceRef(project.profitCentreId, date), entryTime: bizTime(ctx) }, [
      {
        gl: "142100",
        amount,
        pc: project.profitCentreId,
        partner: { type: "Customer", id: project.customerId },
        wbs: project.wbs,
        assignment: project.wbs,
        text: `Retention ${rng.pick([5, 10, 10, 5])}% - ${project.name}`,
      },
      { gl: "410200", amount: -amount, pc: project.profitCentreId, wbs: project.wbs },
    ]);
  }

  // Unbilled revenue (percentage-of-completion run)
  const unbilledProjects = ctx.m.projects.filter((p) => !ctx.reserved.has(p.wbs) && ["Execution", "Commissioned", "On hold"].includes(p.stage));
  for (let i = 0; i < Math.min(N.unbilled, unbilledProjects.length); i++) {
    const project = unbilledProjects[i];
    const age = project.stage === "On hold" ? pickAge(ctx, PROFILES.aged) : pickAge(ctx, PROFILES.recent, 400);
    const date = dateForAge(ctx, age);
    const services = project.profitCentreId === "PC-RA-03" || rng.chance(0.1);
    const amount = rng.money(1_40_00_000, 0.95, 4_00_000, 25_00_00_000);
    ctx.b.post({ docType: "SA", postingDate: date, enteredBy: U.projects, text: "Revenue recognition - percentage of completion", entryTime: "02:10" }, [
      { gl: services ? "141200" : "141100", amount, pc: project.profitCentreId, partner: { type: "Customer", id: project.customerId }, wbs: project.wbs, assignment: project.wbs },
      { gl: services ? "410300" : "410200", amount: -amount, pc: project.profitCentreId, wbs: project.wbs },
    ]);
  }

  // Advances from customers and billing in excess
  for (let i = 0; i < N.customerAdvances; i++) {
    const customer = rng.pick(customers);
    const project = rng.chance(0.7) ? projectFor(ctx, customer) : undefined;
    const pcId = project?.profitCentreId ?? pickPc(ctx).id;
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const amount = rng.money(project ? 1_10_00_000 : 22_00_000, 1.0, 1_00_000, 20_00_00_000);
    if (i % 10 === 9 && project) {
      ctx.b.post({ docType: "SA", postingDate: date, enteredBy: U.projects, text: "Billing in excess of revenue", entryTime: "02:10" }, [
        { gl: "410200", amount, pc: pcId, wbs: project.wbs },
        { gl: "222100", amount: -amount, pc: pcId, partner: { type: "Customer", id: customer.id }, wbs: project.wbs, assignment: project.wbs },
      ]);
      continue;
    }
    ctx.b.post({ docType: "DZ", postingDate: date, enteredBy: U.bank, text: "Advance received", entryTime: bizTime(ctx) }, [
      { gl: "181100", amount, pc: pcId },
      {
        gl: project ? "221100" : "221200",
        amount: -amount,
        pc: pcId,
        partner: { type: "Customer", id: customer.id },
        wbs: project?.wbs,
        assignment: project?.wbs ?? "ADVANCE",
        text: project ? `Mobilisation advance - ${project.name}` : "Advance against purchase order",
      },
    ]);
  }
}

// ---------------------------------------------------------------------------
// Withholding tax deducted by customers on receipts
// ---------------------------------------------------------------------------
const TDS_RATES = [
  { value: { rate: 0.02, nature: "Contract work" }, weight: 0.4 },
  { value: { rate: 0.02, nature: "Technical services" }, weight: 0.15 },
  { value: { rate: 0.001, nature: "Purchase of goods" }, weight: 0.2 },
  { value: { rate: 0.1, nature: "Professional services" }, weight: 0.1 },
  { value: { rate: 0.01, nature: "Contract work" }, weight: 0.15 },
];

/**
 * Invoice → receipt net of TDS (and GST TDS for government customers). The
 * invoice clears; the TDS deducted stays open in TDS receivable until the
 * credit is claimed against the tax credit statement.
 */
export function postReceiptWithTds(
  ctx: Ctx,
  customer: Party,
  receiptDate: IsoDate,
  taxable: number,
  rate: { rate: number; nature: string },
  opts: { forced?: "missing"; project?: Project } = {}
): { tdsLine: LineItem; gstTdsLine?: LineItem } {
  const { rng } = ctx;
  const invoiceDate = addDays(receiptDate, -rng.int(25, 80));
  const inv = postCustomerInvoice(ctx, customer, invoiceDate < "2022-01-03" ? "2022-01-03" : invoiceDate, taxable, { project: opts.project });
  const tds = Math.max(500, Math.round(taxable * rate.rate));
  const gstTds = customer.governmentOrPsu && taxable > 2_50_000 ? Math.round(taxable * 0.02) : 0;
  const quarter = fiscalQuarterLabel(receiptDate, 4, "FY");
  const lines = ctx.b.post({ docType: "DZ", postingDate: receiptDate, enteredBy: U.bank, reference: inv.reference, entryTime: bizTime(ctx) }, [
    { gl: "181100", amount: inv.gross - tds - gstTds, pc: inv.line.profitCentre },
    {
      gl: "161100",
      amount: tds,
      pc: inv.line.profitCentre,
      partner: { type: "Customer", id: customer.id },
      assignment: inv.reference,
      text: `TDS ${rate.nature.toLowerCase()} - ${quarter}`,
    },
    ...(gstTds
      ? [{ gl: "162400", amount: gstTds, pc: inv.line.profitCentre, partner: { type: "Customer" as const, id: customer.id }, assignment: inv.reference, text: `GST TDS - ${quarter}` }]
      : []),
    { gl: "140100", amount: -inv.gross, pc: inv.line.profitCentre, partner: { type: "Customer", id: customer.id }, assignment: inv.reference },
  ]);
  const arCredit = lines.find((l) => l.gl === "140100")!;
  ctx.b.clear([inv.line, arCredit], arCredit.docNo, receiptDate);
  const tdsLine = lines.find((l) => l.gl === "161100")!;
  ctx.tds.push({ lineKey: tdsLine.key, customerId: customer.id, date: receiptDate, taxable, tds, nature: rate.nature, forced: opts.forced });
  return { tdsLine, gstTdsLine: lines.find((l) => l.gl === "162400") };
}

function withholdingReceivable(ctx: Ctx): void {
  const { rng } = ctx;
  const customers = domesticCustomers(ctx);
  for (let i = 0; i < N.tdsReceivable; i++) {
    const customer = rng.pick(customers);
    const rate = rng.weighted(TDS_RATES);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.tds));
    const taxable = rng.money(rate.rate === 0.001 ? 85_00_000 : 24_00_000, 1.0, 60_000, 12_00_00_000);
    postReceiptWithTds(ctx, customer, date, taxable, rate, { project: rng.chance(0.4) ? projectFor(ctx, customer) : undefined });
  }
}

// ---------------------------------------------------------------------------
// Payables, GR/IR and advances
// ---------------------------------------------------------------------------
export function vendorInvoice(ctx: Ctx, vendor: Party, date: IsoDate, taxable: number, opts: { gl?: string; pcId?: string; wbs?: string; clearAfterDays?: number } = {}): LineItem {
  const { rng } = ctx;
  const pcId = opts.pcId ?? pickPc(ctx).id;
  const gst = gstLegs(taxable, "input", rng.chance(0.5), pcId);
  const gross = taxable + gst.reduce((s, l) => s + l.amount, 0);
  const due = vendor.msme && vendor.msme !== "Medium" ? 45 : rng.pick([45, 60, 60, 90]);
  const [ap] = ctx.b.post(
    { docType: "KR", postingDate: date, enteredBy: AP_TEAM, reference: `${vendor.id.slice(5)}/${rng.int(1000, 9999)}`, entryTime: bizTime(ctx) },
    [
      { gl: "210100", amount: -gross, pc: pcId, partner: { type: "Vendor", id: vendor.id }, dueDate: addDays(date, due), assignment: vendor.id },
      { gl: opts.gl ?? ctx.vendorExpenseGl.get(vendor.id)!, amount: taxable, pc: pcId, wbs: opts.wbs },
      ...gst,
    ]
  );
  return ap;
}

export function payVendor(ctx: Ctx, ap: LineItem, date: IsoDate): void {
  const [pay] = ctx.b.post({ docType: "KZ", postingDate: date, enteredBy: U.bank, entryTime: bizTime(ctx), text: "Vendor payment" }, [
    { gl: "210100", amount: -ap.amount, pc: ap.profitCentre, partner: ap.partner, assignment: ap.assignment },
    { gl: "181200", amount: ap.amount, pc: ap.profitCentre },
  ]);
  ctx.b.clear([ap, pay], pay.docNo, date);
}

function payables(ctx: Ctx): void {
  const { rng } = ctx;
  const regular = domesticVendors(ctx, { msme: false });
  const msme = domesticVendors(ctx, { msme: true });
  for (let i = 0; i < N.apDomestic; i++) {
    const isMsme = rng.chance(0.24);
    const vendor = rng.pick(isMsme ? msme : regular);
    // MSME invoices are paid inside the statutory window (planted exceptions excepted)
    const date = dateForAge(ctx, isMsme ? rng.int(0, 40) : pickAge(ctx, PROFILES.recent));
    vendorInvoice(ctx, vendor, date, rng.money(isMsme ? 5_10_000 : 21_00_000, 1.15, 8_000, 8_00_00_000));
  }

  const foreign = foreignVendors(ctx);
  for (let i = 0; i < N.apImport; i++) {
    const vendor = rng.pick(foreign);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.recent));
    const amount = rng.money(24_00_000, 1.0, 50_000, 5_00_00_000);
    const pcId = pickPc(ctx).id;
    ctx.b.post({ docType: "KR", postingDate: date, enteredBy: AP_TEAM, reference: `IMP/${rng.int(10000, 99999)}`, entryTime: bizTime(ctx) }, [
      { gl: "210200", amount: -amount, pc: pcId, partner: { type: "Vendor", id: vendor.id }, docCurrency: vendor.currency, amountDoc: -docAmount(amount, vendor.currency!, date), dueDate: addDays(date, 60), assignment: vendor.id },
      { gl: "510100", amount, pc: pcId },
    ]);
  }

  for (let i = 0; i < N.apGroup; i++) {
    const gc = rng.pick(ctx.m.groupCompanies);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.recent));
    const amount = rng.money(36_00_000, 1.0, 1_00_000, 9_00_00_000);
    const pcId = pickPc(ctx).id;
    const gl = rng.weighted([
      { value: "510100", weight: 0.6 },
      { value: "530800", weight: 0.2 },
      { value: "530900", weight: 0.2 },
    ]);
    ctx.b.post({ docType: "KR", postingDate: date, enteredBy: AP_TEAM, reference: `${gc.id}/${rng.int(1000, 9999)}`, entryTime: bizTime(ctx) }, [
      { gl: "210300", amount: -amount, pc: pcId, partner: { type: "Group company", id: gc.id }, docCurrency: gc.currency, amountDoc: -docAmount(amount, gc.currency!, date), dueDate: addDays(date, 60), assignment: gc.id },
      { gl, amount, pc: pcId },
    ]);
  }
}

/** Goods receipt (GR/IR credit). */
export function postGoodsReceipt(ctx: Ctx, vendor: Party, date: IsoDate, value: number, po: string, item: number, grir = "211300", opts: { pcId?: string; wbs?: string } = {}): LineItem {
  const pcId = opts.pcId ?? pickPc(ctx).id;
  const debitGl = grir === "211500" ? "120200" : grir === "211400" ? ctx.vendorExpenseGl.get(vendor.id) ?? "530300" : "130100";
  const lines = ctx.b.post({ docType: "WE", postingDate: date, enteredBy: U.procurement, reference: po, entryTime: bizTime(ctx), text: "Goods receipt for purchase order" }, [
    { gl: debitGl, amount: value, pc: pcId, wbs: opts.wbs },
    { gl: grir, amount: -value, pc: pcId, partner: { type: "Vendor", id: vendor.id }, po: { number: po, item }, wbs: opts.wbs, assignment: po },
  ]);
  trackPo(ctx, po, item, vendor.id, { gr: date });
  return lines.find((l) => l.gl === grir)!;
}

/** Invoice receipt against a PO (GR/IR debit; AP credit). */
export function postInvoiceReceipt(ctx: Ctx, vendor: Party, date: IsoDate, value: number, po: string, item: number, grir = "211300", opts: { pcId?: string } = {}): { grirLine: LineItem; apLine: LineItem } {
  const pcId = opts.pcId ?? pickPc(ctx).id;
  const gst = gstLegs(value, "input", ctx.rng.chance(0.5), pcId);
  const gross = value + gst.reduce((s, l) => s + l.amount, 0);
  const lines = ctx.b.post({ docType: "RE", postingDate: date, enteredBy: U.procurement, reference: `${vendor.id.slice(5)}/${ctx.rng.int(1000, 9999)}`, entryTime: bizTime(ctx), text: "Invoice receipt" }, [
    { gl: grir, amount: value, pc: pcId, partner: { type: "Vendor", id: vendor.id }, po: { number: po, item }, assignment: po },
    ...gst,
    { gl: "210100", amount: -gross, pc: pcId, partner: { type: "Vendor", id: vendor.id }, dueDate: addDays(date, 60), assignment: po },
  ]);
  trackPo(ctx, po, item, vendor.id, { inv: date });
  return { grirLine: lines.find((l) => l.gl === grir)!, apLine: lines.find((l) => l.gl === "210100")! };
}

function grir(ctx: Ctx): void {
  const { rng } = ctx;
  const vendors = domesticVendors(ctx, { msme: false });
  const account = () => rng.weighted([
    { value: "211300", weight: 0.75 },
    { value: "211400", weight: 0.18 },
    { value: "211500", weight: 0.07 },
  ]);
  for (let i = 0; i < N.grirCredits; i++) {
    const vendor = rng.pick(vendors);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    postGoodsReceipt(ctx, vendor, date, rng.money(2_80_000, 1.2, 2_000, 2_50_00_000), ctx.nextPo(), 10 * rng.int(1, 4), account());
  }
  for (let i = 0; i < N.grirDebits; i++) {
    const vendor = rng.pick(vendors);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.recent, 300));
    postInvoiceReceipt(ctx, vendor, date, rng.money(2_40_000, 1.1, 5_000, 80_00_000), ctx.nextPo(), 10, account());
  }
  // GR and invoice both posted but never cleared against each other
  for (let i = 0; i < 20; i++) {
    const vendor = rng.pick(vendors);
    const grDate = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const invDate = addDays(grDate, rng.int(3, 40));
    if (invDate > ctx.asOf) continue;
    const po = ctx.nextPo();
    const value = rng.money(3_10_000, 1.0, 20_000, 60_00_000);
    postGoodsReceipt(ctx, vendor, grDate, value, po, 10);
    const { apLine } = postInvoiceReceipt(ctx, vendor, invDate, value, po, 10);
    const payDate = addDays(invDate, rng.int(30, 60));
    if (payDate <= ctx.asOf) payVendor(ctx, apLine, payDate);
  }
}

function advances(ctx: Ctx): void {
  const { rng } = ctx;
  const vendors = domesticVendors(ctx, { msme: false });
  const foreign = foreignVendors(ctx);
  for (let i = 0; i < N.vendorAdvances; i++) {
    const kind = rng.weighted([
      { value: "151100", weight: 0.75 },
      { value: "151200", weight: 0.15 },
      { value: "151300", weight: 0.1 },
    ]);
    const vendor = rng.pick(kind === "151200" ? foreign : vendors);
    const age = pickAge(ctx, PROFILES.moderate);
    const date = dateForAge(ctx, age);
    const amount = rng.money(13_00_000, 1.2, 25_000, 4_00_00_000);
    const po = ctx.nextPo();
    const pcId = pickPc(ctx).id;
    ctx.b.post({ docType: "KZ", postingDate: date, enteredBy: AP_TEAM, reference: po, entryTime: bizTime(ctx), text: "Advance payment against purchase order" }, [
      {
        gl: kind,
        amount,
        pc: pcId,
        partner: { type: "Vendor", id: vendor.id },
        po: { number: po, item: 10 },
        assignment: po,
        docCurrency: vendor.currency,
        amountDoc: vendor.currency ? docAmount(amount, vendor.currency, date) : undefined,
      },
      { gl: "181200", amount: -amount, pc: pcId },
    ]);
    // deliveries against the PO since the advance (from the purchasing extract)
    const t = trackPo(ctx, po, 10, vendor.id, { advanceDate: date });
    if (rng.chance(age < 365 ? 0.55 : 0.25)) {
      t.grDates.push(addDays(date, rng.int(15, Math.max(16, Math.min(age - 1, 300)))));
    }
    // material advances above ₹25 lakh are often secured by an advance-payment BG
    if (amount > 25_00_000 && rng.chance(0.45)) {
      const bank = rng.pick(S.banks);
      const validTo = addDays(date, rng.int(300, 560));
      ctx.bankGuarantees.push({
        bgNo: ctx.nextBgNo(bank, date),
        direction: "Received",
        type: "Advance payment",
        partyId: vendor.id,
        bank,
        amount,
        issueDate: addDays(date, -rng.int(2, 10)),
        validTo,
        claimExpiry: rng.chance(0.6) ? addDays(validTo, 90) : undefined,
        linkedPo: po,
        status: "Active",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Other balance sheet items
// ---------------------------------------------------------------------------
const CITIES = ["Mumbai", "Bengaluru", "Delhi", "Chennai", "Kolkata", "Hyderabad", "Pune", "Vadodara", "Nashik", "Faridabad"];

function otherItems(ctx: Ctx, openInvoices: CustomerInvoice[]): void {
  const { rng } = ctx;
  const accountants = S.people.filter((p) => p.roleId === "gl-accountant").map((p) => p.userId);

  for (let i = 0; i < N.employeeAdvances; i++) {
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.recent));
    const travel = rng.chance(0.8);
    const amount = rng.money(travel ? 42_000 : 85_000, 0.7, 5_000, 2_50_000);
    const pcId = pickPc(ctx).id;
    ctx.b.post({ docType: "SA", postingDate: date, enteredBy: U.travel, entryTime: bizTime(ctx) }, [
      { gl: travel ? "152100" : "152200", amount, pc: pcId, assignment: `EMP-${rng.int(10000, 19999)}`, text: travel ? `Travel advance - ${rng.pick(CITIES)}` : "Salary advance" },
      { gl: "181200", amount: -amount, pc: pcId },
    ]);
  }

  const customers = domesticCustomers(ctx);
  const vendors = domesticVendors(ctx, { msme: false });
  for (let i = 0; i < N.deposits; i++) {
    const kind = rng.weighted([
      { value: "153100", weight: 0.35 },
      { value: "153200", weight: 0.45 },
      { value: "153300", weight: 0.2 },
    ]);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.aged));
    const amount = rng.money(4_20_000, 1.1, 10_000, 1_50_00_000);
    const pcId = kind === "153300" ? S.corporateProfitCentre.id : pickPc(ctx).id;
    const partner =
      kind === "153100" ? { type: "Vendor" as const, id: rng.pick(vendors).id }
      : kind === "153200" ? { type: "Customer" as const, id: rng.pick(customers).id }
      : undefined;
    ctx.b.post({ docType: "SA", postingDate: date, enteredBy: rng.pick(accountants), manual: true, entryTime: bizTime(ctx) }, [
      {
        gl: kind,
        amount,
        pc: pcId,
        partner,
        assignment: kind === "153200" ? `TENDER-${rng.int(1000, 9999)}` : undefined,
        text: kind === "153100" ? `Security deposit - premises, ${rng.pick(CITIES)}` : kind === "153200" ? "Earnest money deposit - tender" : rng.pick(["Deposit under protest - appeal", "Electricity deposit", "Customs duty deposit"]),
      },
      { gl: "181200", amount: -amount, pc: pcId },
    ]);
  }

  // Incoming receipts parked in clearing: most are customer payments net of
  // deductions that nobody has applied yet; the rest are genuinely unidentified.
  const byCustomer = new Map<string, CustomerInvoice[]>();
  for (const inv of openInvoices) {
    const list = byCustomer.get(inv.customerId) ?? [];
    list.push(inv);
    byCustomer.set(inv.customerId, list);
  }
  const payers = [...byCustomer.entries()].filter(([, l]) => l.length >= 2);
  const usedInvoices = new Set<string>();
  for (let i = 0; i < N.incomingClearing; i++) {
    const age = rng.chance(0.72) ? rng.int(1, 45) : pickAge(ctx, PROFILES.aged);
    const date = dateForAge(ctx, age);
    let amount: number;
    let narration: string;
    const [customerId, invoices] = payers.length ? rng.pick(payers) : ["", []];
    const candidates = invoices.filter((inv) => inv.date < date && !usedInvoices.has(inv.line.key));
    if (i < N.incomingClearing * 0.62 && candidates.length) {
      const chosen = candidates.slice(0, rng.int(1, Math.min(3, candidates.length)));
      chosen.forEach((c) => usedInvoices.add(c.line.key));
      const rate = rng.weighted(TDS_RATES).rate;
      const tds = chosen.reduce((s, c) => s + Math.round(c.taxable * rate), 0);
      const charges = rng.chance(0.3) ? rng.int(50, 600) : 0;
      amount = chosen.reduce((s, c) => s + c.gross, 0) - tds - charges;
      const customer = partyOf(ctx, customerId);
      narration = rng.chance(0.4)
        ? `NEFT CR ${customer.name.split(" ")[0].toUpperCase()} ${chosen[0].reference}`
        : `RTGS CR ${customer.name.toUpperCase().slice(0, 22)}`;
    } else {
      amount = rng.money(5_80_000, 1.3, 5_000, 2_40_00_000);
      narration = rng.pick(["RTGS CR UNKNOWN REMITTER", "NEFT CR PAYMENT", "IMPS CR TRANSFER", "RTGS CR SETTLEMENT", "NEFT CR BILL PAYMENT"]);
    }
    ctx.b.post({ docType: "DZ", postingDate: date, enteredBy: U.bank, entryTime: bizTime(ctx), text: narration }, [
      { gl: "181100", amount, pc: S.corporateProfitCentre.id },
      { gl: "171200", amount: -amount, pc: S.corporateProfitCentre.id, assignment: `UTR${rng.int(100000, 999999)}`, text: narration },
    ]);
  }

  for (let i = 0; i < N.suspense; i++) {
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const amount = rng.money(2_10_000, 1.2, 1_000, 60_00_000) * (rng.chance(0.65) ? 1 : -1);
    const pcId = pickPc(ctx).id;
    ctx.b.post({ docType: "SA", postingDate: date, enteredBy: rng.pick(accountants), manual: true, entryTime: bizTime(ctx), text: rng.pick(["Unidentified difference - to be investigated", "Parked pending supporting documents", "Temporary posting - awaiting cost centre"]) }, [
      { gl: "171100", amount, pc: pcId },
      { gl: amount > 0 ? "181300" : "531900", amount: -amount, pc: pcId },
    ]);
  }

  // Payment run issued, bank not yet debited
  for (let i = 0; i < N.outgoingClearing; i++) {
    const vendor = rng.pick(vendors);
    const age = rng.chance(0.8) ? rng.int(0, 6) : rng.int(30, 400);
    const runDate = dateForAge(ctx, age);
    const ap = vendorInvoice(ctx, vendor, addDays(runDate, -rng.int(30, 60)), rng.money(6_00_000, 1.0, 10_000, 1_20_00_000));
    const [debit] = ctx.b.post({ docType: "ZP", postingDate: runDate, enteredBy: AP_TEAM, entryTime: bizTime(ctx), text: "Payment run" }, [
      { gl: "210100", amount: -ap.amount, pc: ap.profitCentre, partner: ap.partner, assignment: ap.assignment },
      { gl: "171300", amount: ap.amount, pc: ap.profitCentre, assignment: `PAYRUN-${runDate.replace(/-/g, "")}`, text: `Payment to ${vendor.id}` },
    ]);
    ctx.b.clear([ap, debit], debit.docNo, runDate);
  }

  for (let i = 0; i < N.bankChargesClearing; i++) {
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const amount = rng.money(1_800, 1.0, 150, 25_000);
    ctx.b.post({ docType: "SA", postingDate: date, enteredBy: U.bank, entryTime: bizTime(ctx), text: "Bank charges debited - allocation pending" }, [
      { gl: "171400", amount, pc: S.corporateProfitCentre.id },
      { gl: "181100", amount: -amount, pc: S.corporateProfitCentre.id },
    ]);
  }

  // One inter-bank transfer, cleared in June 2025 (the account is otherwise quiet)
  const out = ctx.b.post({ docType: "SA", postingDate: "2025-06-18", enteredBy: "FQURESHI", manual: true, entryTime: "11:20", text: "Transfer ICICI → SBI" }, [
    { gl: "171500", amount: 25_00_00_000, pc: S.corporateProfitCentre.id, assignment: "TRF-20250618" },
    { gl: "181200", amount: -25_00_00_000, pc: S.corporateProfitCentre.id },
  ]);
  const inn = ctx.b.post({ docType: "SA", postingDate: "2025-06-19", enteredBy: U.bank, entryTime: "10:05", text: "Transfer ICICI → SBI received" }, [
    { gl: "181300", amount: 25_00_00_000, pc: S.corporateProfitCentre.id },
    { gl: "171500", amount: -25_00_00_000, pc: S.corporateProfitCentre.id, assignment: "TRF-20250618" },
  ]);
  ctx.b.clear([out[0], inn[1]], inn[1].docNo, "2025-06-19");

  for (let i = 0; i < N.icReceivable; i++) {
    const gc = rng.pick(ctx.m.groupCompanies);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const amount = rng.money(9_00_000, 1.0, 25_000, 2_00_00_000);
    const pcId = pickPc(ctx).id;
    ctx.b.post({ docType: "SA", postingDate: date, enteredBy: rng.pick(accountants), manual: true, entryTime: bizTime(ctx), text: rng.pick(["Cross-charge - shared engineering", "Recovery of expenses incurred on behalf", "Warranty claim recoverable"]) }, [
      { gl: "164100", amount, pc: pcId, partner: { type: "Group company", id: gc.id }, docCurrency: gc.currency, amountDoc: docAmount(amount, gc.currency!, date), assignment: gc.id },
      { gl: "410300", amount: -amount, pc: pcId },
    ]);
  }
  for (let i = 0; i < N.icPayable; i++) {
    const gc = rng.pick(ctx.m.groupCompanies);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.moderate));
    const amount = rng.money(14_00_000, 1.0, 50_000, 3_00_00_000);
    const pcId = pickPc(ctx).id;
    ctx.b.post({ docType: "KR", postingDate: date, enteredBy: AP_TEAM, entryTime: bizTime(ctx), text: rng.pick(["Royalty and trademark fee", "Group IT services charge", "Management services recharge"]) }, [
      { gl: "251100", amount: -amount, pc: pcId, partner: { type: "Group company", id: gc.id }, docCurrency: gc.currency, amountDoc: -docAmount(amount, gc.currency!, date), assignment: gc.id },
      { gl: rng.chance(0.5) ? "530800" : "530900", amount, pc: pcId },
    ]);
  }

  // Capital work in progress via capital creditors (paid after ~45 days)
  for (let i = 0; i < N.cwip; i++) {
    const vendor = rng.pick(vendors);
    const date = dateForAge(ctx, pickAge(ctx, PROFILES.aged));
    const value = rng.money(38_00_000, 1.1, 1_00_000, 12_00_00_000);
    const pcId = pickPc(ctx).id;
    const gst = gstLegs(value, "input", rng.chance(0.5), pcId);
    const gross = value + gst.reduce((s, l) => s + l.amount, 0);
    const lines = ctx.b.post({ docType: "KR", postingDate: date, enteredBy: AP_TEAM, entryTime: bizTime(ctx), text: "Capital purchase - asset under construction" }, [
      { gl: rng.chance(0.3) ? "120100" : "120200", amount: value, pc: pcId, assignment: `AUC-${rng.int(40000, 49999)}`, text: rng.pick(["Assembly line expansion", "Test bay upgrade", "Factory roof solar plant", "Warehouse racking", "Paint shop modernisation", "New office fit-out"]) },
      ...gst,
      { gl: "261200", amount: -gross, pc: pcId, partner: { type: "Vendor", id: vendor.id }, assignment: vendor.id },
    ]);
    const payDate = addDays(date, rng.int(30, 60));
    if (payDate <= ctx.asOf) {
      const cc = lines.find((l) => l.gl === "261200")!;
      const [pay] = ctx.b.post({ docType: "KZ", postingDate: payDate, enteredBy: U.bank, entryTime: bizTime(ctx), text: "Capital creditor payment" }, [
        { gl: "261200", amount: gross, pc: pcId, partner: cc.partner, assignment: cc.assignment },
        { gl: "181200", amount: -gross, pc: pcId },
      ]);
      ctx.b.clear([cc, pay], pay.docNo, payDate);
    }
  }
}

/** Generate the open-item population. Returns open customer invoices (for later matching data). */
export function generatePopulation(ctx: Ctx): CustomerInvoice[] {
  const openInvoices: CustomerInvoice[] = [];
  receivables(ctx, openInvoices);
  withholdingReceivable(ctx);
  payables(ctx);
  grir(ctx);
  advances(ctx);
  otherItems(ctx, openInvoices);
  return openInvoices;
}
