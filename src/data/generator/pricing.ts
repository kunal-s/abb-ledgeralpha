// Priced material purchases (docs/FRD.md §9.4, S-22) and the exchange
// differences of the year. Every receipt is an ordinary vendor invoice posted
// through the ledger builder against a purchase order; the price reference
// (standard and invoiced price per unit) is kept beside it. Nothing here draws
// from the generator's random stream: quantities and dates come from a hash of
// the receipt, so the rest of the world is unchanged.

import type { IsoDate, Party, PricedReceipt, Project } from "@/types";
import { addDays } from "@/lib/dates";
import { MATERIAL_FAMILIES } from "@/data/workspace/pricing";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { anchor, gstLegs, trackPo, type Ctx } from "@/data/generator/context";

/** A deterministic number in [0, 1) from a string (FNV-1a). */
export function unit(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 4294967296;
}

const MONTHS_2026 = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09"];

export function postPricedPurchases(ctx: Ctx, traction: Project): PricedReceipt[] {
  const { b } = ctx;
  const out: PricedReceipt[] = [];
  let poSeq = 4600000000;
  let refSeq = 7000;

  const vendorOf = new Map<string, Party>();
  for (const f of MATERIAL_FAMILIES) {
    const v = ctx.m.vendors.find((x) => x.country === "IN" && !ctx.reserved.has(x.id) && x.status === "Active" && x.name.endsWith(f.vendorSuffix));
    if (!v) throw new Error(`No vendor for ${f.name}`);
    vendorOf.set(f.id, v);
  }

  const receipt = (familyIndex: number, monthIndex: number, pcId: string, quantity: number, day: number, wbs?: string): PricedReceipt => {
    const f = MATERIAL_FAMILIES[familyIndex];
    const vendor = vendorOf.get(f.id)!;
    const date: IsoDate = `${MONTHS_2026[monthIndex]}-${String(day).padStart(2, "0")}`;
    const price = f.prices[monthIndex];
    const taxable = Math.round(quantity * price);
    poSeq += 1;
    refSeq += 1;
    const po = String(poSeq);
    const interstate = unit(`${po}-gst`) < 0.5;
    const gst = gstLegs(taxable, "input", interstate, pcId);
    const gross = taxable + gst.reduce((s, l) => s + l.amount, 0);
    const qtyText = new Intl.NumberFormat("en-IN").format(quantity);
    const lines = b.post({ docType: "KR", postingDate: date, enteredBy: "AP_SSC01", reference: `${vendor.id.slice(5)}/${refSeq}`, entryTime: `${String(10 + Math.floor(unit(po) * 8)).padStart(2, "0")}:${String(Math.floor(unit(`${po}m`) * 60)).padStart(2, "0")}` }, [
      { gl: "210100", amount: -gross, pc: pcId, partner: { type: "Vendor", id: vendor.id }, dueDate: addDays(date, 45), assignment: vendor.id },
      { gl: "510100", amount: taxable, pc: pcId, wbs, po: { number: po, item: 10 }, text: `${f.name}, ${qtyText} ${f.unit} at ${price}` },
      ...gst,
    ]);
    const ap = lines[0];
    const cost = lines.find((l) => l.gl === "510100")!;
    // paid on the due date when that has passed
    const payDate = addDays(date, 45);
    if (payDate <= ctx.asOf) {
      const pay = b.post({ docType: "KZ", postingDate: payDate, enteredBy: S.systemUsers.bank, entryTime: "11:30", text: "Vendor payment" }, [
        { gl: "210100", amount: -ap.amount, pc: ap.profitCentre, partner: ap.partner, assignment: ap.assignment },
        { gl: "181200", amount: ap.amount, pc: ap.profitCentre },
      ]);
      b.clear([ap, pay[0]], pay[0].docNo, payDate);
    }
    trackPo(ctx, po, 10, vendor.id, { gr: date, inv: date, status: "Closed" });
    const r: PricedReceipt = {
      lineKey: cost.key, docKey: `${cost.fiscalYear}-${cost.docNo}`, po, item: 10, vendorId: vendor.id, material: f.name, linkedTo: f.linkedTo, unit: f.unit,
      quantity, standardPrice: f.standard, invoicePrice: price, postingDate: date, profitCentreId: pcId, wbs,
    };
    out.push(r);
    return r;
  };

  // routine receipts: each profit centre buys its families every month, in a quantity that is a share of its material cost
  MONTHS_2026.forEach((month, mi) => {
    const m = Number(month.slice(5, 7));
    for (const pc of S.profitCentres) {
      MATERIAL_FAMILIES.forEach((f, fi) => {
        const share = f.shares[pc.id];
        if (!share) return;
        const plan = S.monthlyRevenue2026 * pc.weight * S.seasonality[m - 1] * pc.materialRatio;
        const jitter = 0.9 + 0.2 * unit(`${pc.id}-${f.id}-${month}`);
        let qty = Math.round((plan * share * jitter) / f.prices[mi] / 100) * 100;
        // the traction project's own copper is posted separately below
        if (f.id === "CU" && pc.id === traction.profitCentreId && (mi === 7 || mi === 8)) qty = Math.max(0, qty - (mi === 8 ? 40_000 : 36_000));
        if (qty <= 0) return;
        receipt(fi, mi, pc.id, qty, 3 + Math.floor(unit(`${pc.id}-${f.id}-${month}-d`) * 22));
      });
    }
  });

  // S-22: copper-linked purchase orders of one project. The price moved from 780 to 890 per kg-eq in September
  // against a standard of 780: 40,000 kg-eq at 110 more is 44,00,000 on the project.
  const aug = receipt(0, 7, traction.profitCentreId, 36_000, 12, traction.wbs);
  const sep = receipt(0, 8, traction.profitCentreId, 40_000, 9, traction.wbs);
  anchor(ctx, "S-22", sep.lineKey, aug.lineKey);

  return out;
}

/** Exchange differences on settlement of foreign currency balances, one a month, corporate. */
export function postExchangeDifferences(ctx: Ctx): void {
  const { b } = ctx;
  const corp = S.corporateProfitCentre.id;
  const amounts = [-3_20_000, 1_85_000, -2_40_000, 4_10_000, -1_15_000, 2_60_000, -5_30_000, 1_40_000, -6_80_000];
  amounts.forEach((a, i) => {
    const date: IsoDate = addDays(`${MONTHS_2026[i]}-01`, 26 + Math.floor(unit(`fx-${i}`) * 3));
    const abs = Math.abs(a);
    b.post({ docType: "SA", postingDate: date, enteredBy: S.systemUsers.bank, entryTime: "16:40", text: "Exchange difference on settlement" }, [
      { gl: a < 0 ? "531700" : "181400", amount: abs, pc: corp },
      { gl: a < 0 ? "181400" : "462100", amount: -abs, pc: corp },
    ]);
  });
}
