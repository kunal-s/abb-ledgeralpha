// Planted demo scenarios for the demo workspace (docs/FRD.md §9.4). Each one
// is ordinary ledger data - posted through the same builder as the
// population - so every rule and screen treats it like any other record.
// Scenario IDs never appear in the data; `ctx.anchors` maps them to line keys
// for tests.

import type { IsoDate, LineItem, Party, Project } from "@/types";
import { addDays } from "@/lib/dates";
import type { Masters } from "@/data/generator/masters";
import { anchor, bizTime, trackPo, type Ctx } from "@/data/generator/context";
import { payVendor, postGoodsReceipt, postInvoiceReceipt, postReceiptWithTds } from "@/data/generator/population";
import { WORLD_SPEC as S } from "@/data/workspace/spec";

export interface ScenarioRefs {
  vendors: Record<"S01" | "S02" | "S03" | "S04" | "S05" | "S13" | "S16" | "S24a" | "S24b" | "S24c" | "S19a" | "S19b" | "S19c" | "S19d", Party>;
  customers: Record<"S06" | "S07" | "S18", Party>;
  projects: Record<"S08" | "S09" | "S10" | "S18" | "S20", Project>;
}

/**
 * Choose (and where needed adjust) the master data the scenarios use, and
 * reserve it so the random population does not touch it.
 */
export function reserveScenarioMasters(m: Masters, reserved: Set<string>): ScenarioRefs {
  const domestic = m.vendors.filter((v) => v.country === "IN" && !v.msme);
  const pickVendor = (i: number, patch: Partial<Party> = {}) => {
    const v = domestic[i];
    Object.assign(v, patch);
    reserved.add(v.id);
    return v;
  };
  const vendors = {
    S01: pickVendor(3, { status: "Inactive" }),
    S02: pickVendor(11, { status: "Active" }),
    S03: pickVendor(19, { status: "Active" }),
    S04: pickVendor(27, { status: "Blocked" }),
    S05: pickVendor(35, { status: "Inactive" }),
    S13: pickVendor(43, { status: "Active" }),
    S16: pickVendor(51, { status: "Active" }),
    S24a: pickVendor(59, { status: "Active", msme: "Micro" }),
    S24b: pickVendor(67, { status: "Active", msme: "Small" }),
    S24c: pickVendor(75, { status: "Active", msme: "Micro" }),
    S19a: pickVendor(83, { status: "Active" }),
    S19b: pickVendor(91, { status: "Active" }),
    S19c: pickVendor(99, { status: "Active" }),
    S19d: pickVendor(107, { status: "Active" }),
  };

  const domesticCustomers = m.customers.filter((c) => c.country === "IN");
  const metro = domesticCustomers.find((c) => c.name.includes("Metro Rail")) ?? domesticCustomers[0];
  const psu = domesticCustomers.find((c) => c.governmentOrPsu && c.id !== metro.id) ?? domesticCustomers[1];
  const s18 = domesticCustomers[13];
  s18.governmentOrPsu = false;
  reserved.add(s18.id);
  // the S-18 balance must be exactly the planted items: keep its other projects quiet
  for (const p of m.projects) if (p.customerId === s18.id) reserved.add(p.wbs);
  const customers = { S06: domesticCustomers[5], S07: domesticCustomers[9], S18: s18 };

  const short = (c: Party) => c.name.split(" ")[0];
  const newProject = (p: Project): Project => {
    m.projects.push(p);
    reserved.add(p.wbs);
    return p;
  };
  const projects = {
    S08: newProject({ wbs: "P-2024-1418", name: `Traction substations - ${short(metro)}`, customerId: metro.id, profitCentreId: "PC-MO-03", stage: "On hold", contractValue: 64_80_00_000, startDate: "2024-03-11" }),
    S09: newProject({ wbs: "P-2022-1093", name: `Pumping station motors - ${short(psu)}`, customerId: psu.id, profitCentreId: "PC-PA-02", stage: "DLP ended", contractValue: 22_40_00_000, startDate: "2022-02-14", dlpEnd: addDays(S.asOf, -240) }),
    S10: newProject({ wbs: "P-2023-1206", name: `Unit control system upgrade - ${short(domesticCustomers[21])}`, customerId: domesticCustomers[21].id, profitCentreId: "PC-PA-01", stage: "Closed", contractValue: 15_60_00_000, startDate: "2023-01-09", dlpEnd: "2025-08-30" }),
    S18: newProject({ wbs: "P-2025-1377", name: `Campus power distribution - ${short(s18)}`, customerId: s18.id, profitCentreId: "PC-EL-02", stage: "Execution", contractValue: 28_50_00_000, startDate: "2025-06-02" }),
    S20: newProject({ wbs: "P-2023-1311", name: `Substation package - ${short(domesticCustomers[29])}`, customerId: domesticCustomers[29].id, profitCentreId: "PC-EL-02", stage: "Commissioned", contractValue: 35_00_00_000, startDate: "2023-04-03" }),
  };
  return { vendors, customers, projects };
}

/** Customer invoice with an exact gross amount (GST backed out at 18% IGST). */
function invoiceGross(ctx: Ctx, customer: Party, project: Project, date: IsoDate, gross: number, text: string): LineItem {
  const taxable = Math.round(gross / 1.18);
  const reference = ctx.nextInvoiceRef(project.profitCentreId, date);
  const [ar] = ctx.b.post({ docType: "DR", postingDate: date, enteredBy: S.systemUsers.billing, reference, entryTime: bizTime(ctx) }, [
    { gl: "140100", amount: gross, pc: project.profitCentreId, partner: { type: "Customer", id: customer.id }, wbs: project.wbs, assignment: reference, dueDate: addDays(date, 45), text },
    { gl: "410200", amount: -taxable, pc: project.profitCentreId, wbs: project.wbs },
    { gl: "241600", amount: -(gross - taxable), pc: project.profitCentreId },
  ]);
  return ar;
}

/** Receipt that clears an invoice and leaves a residual open item (SAP residual processing). */
function shortPayment(ctx: Ctx, invoice: LineItem, date: IsoDate, residual: number, text: string): LineItem {
  const lines = ctx.b.post({ docType: "DZ", postingDate: date, enteredBy: S.systemUsers.bank, reference: invoice.assignment, entryTime: bizTime(ctx) }, [
    { gl: "181100", amount: invoice.amount - residual, pc: invoice.profitCentre },
    { gl: "140100", amount: residual, pc: invoice.profitCentre, partner: invoice.partner, wbs: invoice.wbs, assignment: invoice.assignment, text },
    { gl: "140100", amount: -invoice.amount, pc: invoice.profitCentre, partner: invoice.partner, wbs: invoice.wbs, assignment: invoice.assignment },
  ]);
  ctx.b.clear([invoice, lines[2]], lines[2].docNo, date);
  return lines[1];
}

/** Vendor invoice with an exact gross amount. */
function vendorInvoiceGross(ctx: Ctx, vendor: Party, date: IsoDate, gross: number, gl = "510100"): LineItem {
  const taxable = Math.round(gross / 1.18);
  const pc = "PC-EL-01";
  const [ap] = ctx.b.post({ docType: "KR", postingDate: date, enteredBy: "AP_SSC01", reference: `${vendor.id.slice(5)}/${ctx.rng.int(1000, 9999)}`, entryTime: bizTime(ctx) }, [
    { gl: "210100", amount: -gross, pc, partner: { type: "Vendor", id: vendor.id }, dueDate: addDays(date, 45), assignment: vendor.id },
    { gl, amount: taxable, pc },
    { gl: "162300", amount: gross - taxable, pc },
  ]);
  return ap;
}

export function plantScenarios(ctx: Ctx, r: ScenarioRefs): void {
  const { b } = ctx;
  const V = r.vendors;
  const C = r.customers;
  const P = r.projects;

  // S-01 GR/IR: received 412 days ago, PO closed, never invoiced
  const s01 = postGoodsReceipt(ctx, V.S01, "2025-08-14", 18_64_320, "4500187321", 10, "211300", { pcId: "PC-MO-02" });
  trackPo(ctx, "4500187321", 10, V.S01.id, { status: "Closed" });
  anchor(ctx, "S-01", s01.key);

  // S-02 GR/IR: GR in the legacy ERP, invoice in Central Finance, never cleared
  const s02gr = postGoodsReceipt(ctx, V.S02, "2023-11-20", 7_42_180, "4500203318", 10, "211300", { pcId: "PC-EL-01" });
  const s02 = postInvoiceReceipt(ctx, V.S02, "2024-02-12", 7_42_180, "4500203318", 10, "211300", { pcId: "PC-EL-01" });
  payVendor(ctx, s02.apLine, "2024-03-28");
  trackPo(ctx, "4500203318", 10, V.S02.id, { status: "Closed" });
  anchor(ctx, "S-02", s02gr.key, s02.grirLine.key);

  // S-03 GR/IR: invoiced 128 days ago, goods never received
  const s03 = postInvoiceReceipt(ctx, V.S03, addDays(ctx.asOf, -128), 4_06_950, "4500241077", 10, "211300", { pcId: "PC-RA-02" });
  trackPo(ctx, "4500241077", 10, V.S03.id, { status: "Open" });
  anchor(ctx, "S-03", s03.grirLine.key);

  // S-04 Vendor advance: 438 days, no PO activity, vendor blocked, covered by an advance-payment BG
  const [s04] = b.post({ docType: "KZ", postingDate: addDays(ctx.asOf, -438), enteredBy: "AP_SSC01", reference: "4500178044", entryTime: "12:41", text: "Advance payment against purchase order" }, [
    { gl: "151100", amount: 1_24_36_500, pc: "PC-PA-01", partner: { type: "Vendor", id: V.S04.id }, po: { number: "4500178044", item: 10 }, assignment: "4500178044" },
    { gl: "181200", amount: -1_24_36_500, pc: "PC-PA-01" },
  ]);
  trackPo(ctx, "4500178044", 10, V.S04.id, { advanceDate: s04.postingDate, status: "Open" });
  ctx.bankGuarantees.push({
    bgNo: "HDFC/BG/2025/00731",
    direction: "Received",
    type: "Advance payment",
    partyId: V.S04.id,
    bank: "HDFC Bank",
    amount: 1_24_36_500,
    issueDate: addDays(s04.postingDate, -5),
    validTo: "2026-12-31",
    claimExpiry: "2027-03-31",
    linkedPo: "4500178044",
    status: "Active",
  });
  anchor(ctx, "S-04", s04.key, "HDFC/BG/2025/00731");

  // S-05 Vendor advance: 512 days, PO closed, vendor inactive, no BG
  const [s05] = b.post({ docType: "KZ", postingDate: addDays(ctx.asOf, -512), enteredBy: "AP_SSC01", reference: "4500169930", entryTime: "15:02", text: "Advance payment against purchase order" }, [
    { gl: "151100", amount: 36_80_000, pc: "PC-EL-03", partner: { type: "Vendor", id: V.S05.id }, po: { number: "4500169930", item: 10 }, assignment: "4500169930" },
    { gl: "181200", amount: -36_80_000, pc: "PC-EL-03" },
  ]);
  trackPo(ctx, "4500169930", 10, V.S05.id, { advanceDate: s05.postingDate, status: "Closed" });
  anchor(ctx, "S-05", s05.key);

  // S-06 / S-07 TDS deducted by customers, never credited in the tax statement
  const s06 = postReceiptWithTds(ctx, C.S06, "2024-11-18", 2_31_35_000, { rate: 0.02, nature: "Contract work" }, { forced: "missing" });
  anchor(ctx, "S-06", s06.tdsLine.key);
  const s07 = postReceiptWithTds(ctx, C.S07, "2023-02-21", 1_09_47_000, { rate: 0.02, nature: "Contract work" }, { forced: "missing" });
  anchor(ctx, "S-07", s07.tdsLine.key);

  // S-08 Unbilled revenue on a project on hold; last billed 274 days ago
  const lastBilled = addDays(ctx.asOf, -274);
  const s08inv = invoiceGross(ctx, partyById(ctx, P.S08.customerId), P.S08, lastBilled, 1_32_63_200, `Milestone billing - ${P.S08.name}`);
  const s08pay = b.post({ docType: "DZ", postingDate: addDays(lastBilled, 43), enteredBy: S.systemUsers.bank, entryTime: "11:12" }, [
    { gl: "181100", amount: s08inv.amount, pc: s08inv.profitCentre },
    { gl: "140100", amount: -s08inv.amount, pc: s08inv.profitCentre, partner: s08inv.partner, wbs: s08inv.wbs, assignment: s08inv.assignment },
  ]);
  b.clear([s08inv, s08pay[1]], s08pay[1].docNo, s08pay[1].postingDate);
  const [s08] = b.post({ docType: "SA", postingDate: lastBilled, enteredBy: S.systemUsers.projects, entryTime: "02:10", text: "Revenue recognition - percentage of completion" }, [
    { gl: "141100", amount: 2_86_12_400, pc: P.S08.profitCentreId, partner: { type: "Customer", id: P.S08.customerId }, wbs: P.S08.wbs, assignment: P.S08.wbs },
    { gl: "410200", amount: -2_86_12_400, pc: P.S08.profitCentreId, wbs: P.S08.wbs },
  ]);
  anchor(ctx, "S-08", s08.key);

  // S-09 Retention with a PSU customer; DLP ended 240 days ago
  const [s09] = b.post({ docType: "DR", postingDate: "2024-06-28", enteredBy: S.systemUsers.billing, reference: ctx.nextInvoiceRef(P.S09.profitCentreId, "2024-06-28"), entryTime: "16:20" }, [
    { gl: "142100", amount: 1_12_47_800, pc: P.S09.profitCentreId, partner: { type: "Customer", id: P.S09.customerId }, wbs: P.S09.wbs, assignment: P.S09.wbs, text: `Retention 10% - ${P.S09.name}` },
    { gl: "410200", amount: -1_12_47_800, pc: P.S09.profitCentreId, wbs: P.S09.wbs },
  ]);
  anchor(ctx, "S-09", s09.key);

  // S-10 Customer advance on a closed project, unadjusted for 540 days
  const s10 = b.post({ docType: "DZ", postingDate: addDays(ctx.asOf, -540), enteredBy: S.systemUsers.bank, entryTime: "10:48", text: "Advance received" }, [
    { gl: "181100", amount: 58_40_000, pc: P.S10.profitCentreId },
    { gl: "221100", amount: -58_40_000, pc: P.S10.profitCentreId, partner: { type: "Customer", id: P.S10.customerId }, wbs: P.S10.wbs, assignment: P.S10.wbs, text: `Mobilisation advance - ${P.S10.name}` },
  ]);
  anchor(ctx, "S-10", s10[1].key);

  // S-11 Incoming RTGS parked in clearing for 211 days
  const metro = partyById(ctx, P.S08.customerId);
  const narration = `RTGS CR ${metro.name.toUpperCase().slice(0, 24)}`;
  const s11 = b.post({ docType: "DZ", postingDate: addDays(ctx.asOf, -211), enteredBy: S.systemUsers.bank, entryTime: "13:37", text: narration }, [
    { gl: "181100", amount: 23_60_000, pc: S.corporateProfitCentre.id },
    { gl: "171200", amount: -23_60_000, pc: S.corporateProfitCentre.id, assignment: "UTR614208", text: narration },
  ]);
  anchor(ctx, "S-11", s11[1].key);

  // S-12 Round-number manual provision posted at period end, entered at 11:42 PM
  const s12 = b.post({ docType: "SA", postingDate: ctx.asOf, entryDate: ctx.asOf, entryTime: "23:42", enteredBy: "AMALHOTRA", manual: true, text: `Provision for LD - ${P.S08.name}` }, [
    { gl: "531300", amount: 25_00_000, pc: P.S08.profitCentreId, wbs: P.S08.wbs },
    { gl: "231200", amount: -25_00_000, pc: P.S08.profitCentreId, wbs: P.S08.wbs },
  ]);
  anchor(ctx, "S-12", s12[1].key);

  // S-13 A vendor invoice credited to the vendor-advance account
  const s13 = b.post({ docType: "KR", postingDate: "2026-08-12", enteredBy: "AP_SSC01", reference: `${V.S13.id.slice(5)}/7731`, entryTime: "16:55", text: "Annual maintenance contract" }, [
    { gl: "530300", amount: 2_93_220, pc: "PC-RA-03" },
    { gl: "162300", amount: 52_780, pc: "PC-RA-03" },
    { gl: "151100", amount: -3_46_000, pc: "PC-RA-03", partner: { type: "Vendor", id: V.S13.id }, assignment: V.S13.id },
  ]);
  anchor(ctx, "S-13", s13[2].key);

  // S-14 Posting to an inter-bank clearing account quiet for 14 months
  const s14 = b.post({ docType: "SA", postingDate: "2026-08-21", enteredBy: "FQURESHI", manual: true, entryTime: "17:05", text: "Transfer pending confirmation" }, [
    { gl: "171500", amount: 9_80_000, pc: S.corporateProfitCentre.id, assignment: "TRF-20260821" },
    { gl: "181200", amount: -9_80_000, pc: S.corporateProfitCentre.id },
  ]);
  anchor(ctx, "S-14", s14[0].key);

  // S-15 The same accrual moved across three accounts in 90 days
  const a1 = b.post({ docType: "SA", postingDate: "2026-06-10", enteredBy: "AMALHOTRA", manual: true, entryTime: "12:15", text: "Accrual - consultancy fees" }, [
    { gl: "530500", amount: 14_20_000, pc: "PC-PA-01" },
    { gl: "232100", amount: -14_20_000, pc: "PC-PA-01", assignment: "ACR-2026-0612" },
  ]);
  const a2 = b.post({ docType: "SA", postingDate: "2026-07-22", enteredBy: "AMALHOTRA", manual: true, entryTime: "18:02", text: "Reclass to onerous contract provision" }, [
    { gl: "232100", amount: 14_20_000, pc: "PC-PA-01", assignment: "ACR-2026-0612" },
    { gl: "231300", amount: -14_20_000, pc: "PC-PA-01", assignment: "ACR-2026-0612" },
  ]);
  const a3 = b.post({ docType: "SA", postingDate: "2026-09-08", enteredBy: "AMALHOTRA", manual: true, entryTime: "19:26", text: "Reclass to warranty provision" }, [
    { gl: "231300", amount: 14_20_000, pc: "PC-PA-01", assignment: "ACR-2026-0612" },
    { gl: "231100", amount: -14_20_000, pc: "PC-PA-01", assignment: "ACR-2026-0612" },
  ]);
  anchor(ctx, "S-15", a1[1].key, a2[1].key, a3[1].key);

  // S-16 TDS deducted on a professional fee, never deposited (7 months)
  const fee = b.post({ docType: "KR", postingDate: "2026-02-26", enteredBy: "AP_SSC01", reference: `${V.S16.id.slice(5)}/2207`, entryTime: "14:31", text: "Professional fees - tax advisory" }, [
    { gl: "530500", amount: 18_43_000, pc: S.corporateProfitCentre.id },
    { gl: "210100", amount: -16_58_700, pc: S.corporateProfitCentre.id, partner: { type: "Vendor", id: V.S16.id }, dueDate: "2026-03-28", assignment: V.S16.id },
    { gl: "241200", amount: -1_84_300, pc: S.corporateProfitCentre.id, assignment: "TDS-PROF-2026-02" },
  ]);
  payVendor(ctx, fee[1], "2026-03-20");
  anchor(ctx, "S-16", fee[2].key);

  // S-18 Customer balance ₹2,40,00,000 vs customer confirmation ₹1,96,50,000
  const c = C.S18;
  const p = P.S18;
  const agreed = [
    invoiceGross(ctx, c, p, "2026-07-14", 62_40_000, `Milestone billing - ${p.name}`),
    invoiceGross(ctx, c, p, "2026-08-03", 48_75_500, `Milestone billing - ${p.name}`),
    invoiceGross(ctx, c, p, "2026-08-21", 53_12_300, `Milestone billing - ${p.name}`),
    invoiceGross(ctx, c, p, "2026-09-10", 32_22_200, `Milestone billing - ${p.name}`),
  ];
  const timing = invoiceGross(ctx, c, p, "2026-09-29", 23_60_000, `Milestone billing - ${p.name}`);
  const [retention] = b.post({ docType: "DR", postingDate: "2026-08-03", enteredBy: S.systemUsers.billing, reference: ctx.nextInvoiceRef(p.profitCentreId, "2026-08-03"), entryTime: "16:02" }, [
    { gl: "142100", amount: 11_80_000, pc: p.profitCentreId, partner: { type: "Customer", id: c.id }, wbs: p.wbs, assignment: p.wbs, text: `Retention 10% - ${p.name}` },
    { gl: "410200", amount: -11_80_000, pc: p.profitCentreId, wbs: p.wbs },
  ]);
  const tdsInvoice = invoiceGross(ctx, c, p, "2026-06-12", 1_18_00_000, `Milestone billing - ${p.name}`);
  const tdsResidual = shortPayment(ctx, tdsInvoice, "2026-09-04", 2_00_000, "Residual - short payment");
  const ldInvoice = invoiceGross(ctx, c, p, "2026-06-25", 61_00_000, `Milestone billing - ${p.name}`);
  const ldResidual = shortPayment(ctx, ldInvoice, "2026-09-11", 6_10_000, "Residual - short payment, deduction disputed");
  anchor(ctx, "S-18", ...agreed.map((l) => l.key), timing.key, retention.key, tdsResidual.key, ldResidual.key);

  // S-20 Performance BG issued on a commissioned project, expiring in 45 days
  ctx.bankGuarantees.push({
    bgNo: "SBI/BG/2023/04127",
    direction: "Issued",
    type: "Performance",
    partyId: P.S20.customerId,
    bank: "State Bank of India",
    amount: 3_50_00_000,
    issueDate: "2023-05-02",
    validTo: addDays(ctx.asOf, 45),
    claimExpiry: addDays(ctx.asOf, 135),
    linkedWbs: P.S20.wbs,
    status: "Active",
  });
  anchor(ctx, "S-20", "SBI/BG/2023/04127");

  // S-21 EUR 5,00,000 payable to a group company, booked at ₹96.00
  const gcDe = ctx.m.groupCompanies.find((g) => g.id === "GC-DE01")!;
  const s21 = b.post({ docType: "KR", postingDate: "2026-08-01", enteredBy: "AP_SSC01", reference: "GC-DE01/88412", entryTime: "10:22", text: "Drives modules - import from group factory" }, [
    { gl: "210300", amount: -4_80_00_000, pc: "PC-MO-01", partner: { type: "Group company", id: gcDe.id }, docCurrency: "EUR", amountDoc: -5_00_000, dueDate: "2026-10-30", assignment: gcDe.id },
    { gl: "510100", amount: 4_80_00_000, pc: "PC-MO-01" },
  ]);
  anchor(ctx, "S-21", s21[0].key);

  // S-24 MSME supplier invoices unpaid beyond 45 days
  const msme: [Party, number, number][] = [
    [V.S24a, 62, 9_44_000],
    [V.S24a, 104, 7_03_100],
    [V.S24b, 75, 6_72_600],
    [V.S24b, 119, 7_58_100],
    [V.S24c, 88, 8_12_200],
  ];
  anchor(ctx, "S-24", ...msme.map(([v, age, gross]) => vendorInvoiceGross(ctx, v, addDays(ctx.asOf, -age), gross).key));

  // S-19 Bank reconciliation: items between the books and the bank statements at the period end.
  // Books-side lines are real ledger documents; bank-only items (charges, interest, an unidentified
  // receipt) have no ledger line and are added by the reconciliation data.
  const corp = S.corporateProfitCentre.id;
  const deposits: [IsoDate, number, string][] = [
    ["2026-09-29", 14_20_500, "Cheque deposited, awaiting clearing"],
    ["2026-09-30", 6_85_300, "Cheque deposited, awaiting clearing"],
    ["2026-09-30", 22_40_000, "Cheque deposited, awaiting clearing"],
  ];
  const depositKeys = deposits.map(([date, amount, text]) => {
    const [bank] = b.post({ docType: "DZ", postingDate: date, enteredBy: S.systemUsers.bank, entryTime: "16:35", text }, [
      { gl: "181100", amount, pc: corp },
      { gl: "171200", amount: -amount, pc: corp, assignment: `CHQ${Math.round(amount / 100) % 1000000}`, text },
    ]);
    return bank.key;
  });
  anchor(ctx, "S-19", ...depositKeys);
  const payments: [Party, IsoDate, number][] = [
    [V.S19a, "2026-09-28", 9_45_000],
    [V.S19b, "2026-09-28", 3_18_250],
    [V.S19c, "2026-09-29", 17_92_600],
    [V.S19d, "2026-09-30", 5_60_000],
  ];
  const paymentKeys = payments.map(([vendor, date, gross]) => {
    const ap = vendorInvoiceGross(ctx, vendor, addDays(date, -40), gross);
    const pay = b.post({ docType: "KZ", postingDate: date, enteredBy: S.systemUsers.bank, entryTime: "15:10", text: "Vendor payment, cheque issued" }, [
      { gl: "210100", amount: gross, pc: ap.profitCentre, partner: ap.partner, assignment: ap.assignment },
      { gl: "181200", amount: -gross, pc: ap.profitCentre, assignment: `CHQ-${vendor.id.slice(5)}` },
    ]);
    b.clear([ap, pay[0]], pay[0].docNo, date);
    return pay[1].key;
  });
  anchor(ctx, "S-19", ...paymentKeys);

  // S-25 Sub-ledger reconciliation: manual postings made straight to a control account
  const arDirect = b.post({ docType: "SA", postingDate: "2026-09-25", enteredBy: "AMALHOTRA", manual: true, entryTime: "16:48", text: "Manual billing adjustment posted to receivables control" }, [
    { gl: "140100", amount: 4_87_300, pc: "PC-EL-01" },
    { gl: "410300", amount: -4_87_300, pc: "PC-EL-01" },
  ]);
  const apDirect = b.post({ docType: "SA", postingDate: "2026-09-22", enteredBy: "AMALHOTRA", manual: true, entryTime: "17:12", text: "Manual accrual posted to payables control" }, [
    { gl: "530300", amount: 2_15_900, pc: "PC-RA-03" },
    { gl: "210100", amount: -2_15_900, pc: "PC-RA-03" },
  ]);
  anchor(ctx, "S-25", arDirect[0].key, apDirect[1].key);
}

function partyById(ctx: Ctx, id: string): Party {
  return ctx.m.parties.find((p) => p.id === id)!;
}
