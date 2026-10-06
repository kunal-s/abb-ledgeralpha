import { describe, expect, it } from "vitest";
import type { LineItem, World } from "@/types";
import { generateWorld } from "@/data/generator";
import { balanceAt, closingFromLines, computeBalances } from "@/data/balances";
import { isOpenAt, runQualityChecks } from "@/data/quality";
import { addDays, daysBetween, fiscalQuarterLabel } from "@/lib/dates";

const t0 = performance.now();
const world = generateWorld();
const generationMs = performance.now() - t0;
const balances = computeBalances(world.lines, world.glAccounts, world.asOf, 1);
const lineByKey = new Map(world.lines.map((l) => [l.key, l]));
const party = (id: string) => world.parties.find((p) => p.id === id)!;
const project = (wbs: string) => world.projects.find((p) => p.wbs === wbs)!;
const po = (n: string) => world.purchaseOrders.find((p) => p.po === n)!;
const age = (l: LineItem) => daysBetween(l.postingDate, world.asOf);

function anchored(id: string): LineItem[] {
  const keys = world.anchors[id];
  expect(keys, `anchor ${id}`).toBeDefined();
  return keys.filter((k) => lineByKey.has(k)).map((k) => lineByKey.get(k)!);
}

function checksum(w: World): number {
  return w.lines.reduce((s, l, i) => (s + (Math.abs(l.amount) % 100_003) * ((i % 13) + 1) + l.key.length) % 1_000_000_007, 0);
}

describe("world generation", () => {
  it("is deterministic", () => {
    const again = generateWorld();
    expect(again.lines.length).toBe(world.lines.length);
    expect(checksum(again)).toBe(checksum(world));
  });

  it("generates fast enough to run in the browser", () => {
    expect(generationMs).toBeLessThan(3000);
  });

  it("passes every load check", () => {
    for (const c of runQualityChecks(world, balances)) {
      expect(c.exceptions, `${c.name}: ${c.samples.join(", ")}`).toBe(0);
      expect(c.checked, c.name).toBeGreaterThan(0);
    }
  });

  it("agrees with an independent recomputation of closing balances", () => {
    for (const periodEnd of ["2025-12-31", "2026-06-30", "2026-09-30"]) {
      const recomputed = closingFromLines(world.lines, world.glAccounts, periodEnd, 1);
      for (const g of world.glAccounts) {
        expect(recomputed.get(g.gl)!.closing, `${g.gl} at ${periodEnd}`).toBe(balanceAt(balances, g.gl, periodEnd)!.closing);
      }
    }
  });

  it("has realistic volumes", () => {
    const open = world.lines.filter((l) => world.glAccounts.find((g) => g.gl === l.gl)?.openItemManaged && isOpenAt(l, world.asOf));
    expect(world.lines.length).toBeGreaterThan(25_000);
    expect(world.lines.length).toBeLessThan(90_000);
    expect(open.length).toBeGreaterThan(7_000);
    expect(open.length).toBeLessThan(12_000);
    expect(world.projects.length).toBeGreaterThanOrEqual(190);
    expect(world.glAccounts.length).toBeGreaterThan(100);
  });

  it("keeps bank and cash balances positive in every period", () => {
    for (const gl of ["181100", "181200", "181300", "181400"]) {
      for (const row of balances.byGl.get(gl)!) expect(row.closing, `${gl} ${row.periodEnd}`).toBeGreaterThan(0);
    }
  });

  it("produces a plausible result for the current year", () => {
    const revenue = -["410100", "410200", "410300", "410400"].reduce((s, gl) => s + balanceAt(balances, gl, world.asOf)!.closing, 0);
    // roughly nine months of ₹1,100 cr
    expect(revenue).toBeGreaterThan(8_000_00_00_000);
    expect(revenue).toBeLessThan(12_000_00_00_000);
  });
});

describe("planted scenarios", () => {
  it("S-01 GR/IR credit, 412 days, PO closed, vendor inactive", () => {
    const [l] = anchored("S-01");
    expect([l.gl, l.amount, age(l)]).toEqual(["211300", -18_64_320, 412]);
    expect(isOpenAt(l, world.asOf)).toBe(true);
    expect(po(l.po!.number).status).toBe("Closed");
    expect(po(l.po!.number).lastInvoiceDate).toBeUndefined();
    expect(party(l.partner!.id).status).toBe("Inactive");
  });

  it("S-02 uncleared GR/IR pair split across legacy and Central Finance", () => {
    const [gr, inv] = anchored("S-02");
    expect(gr.amount + inv.amount).toBe(0);
    expect(gr.sourceSystem).not.toBe(inv.sourceSystem);
    expect(gr.po).toEqual(inv.po);
  });

  it("S-03 invoice without goods receipt, 128 days", () => {
    const [l] = anchored("S-03");
    expect([l.amount, age(l)]).toEqual([4_06_950, 128]);
    expect(po(l.po!.number).lastGrDate).toBeUndefined();
  });

  it("S-04 stale advance covered by a valid advance-payment BG", () => {
    const [l] = anchored("S-04");
    expect([l.gl, l.amount, age(l)]).toEqual(["151100", 1_24_36_500, 438]);
    expect(party(l.partner!.id).status).toBe("Blocked");
    expect(po(l.po!.number).lastGrDate).toBeUndefined();
    const bg = world.bankGuarantees.find((b) => b.linkedPo === l.po!.number)!;
    expect([bg.direction, bg.type, bg.amount, bg.status]).toEqual(["Received", "Advance payment", 1_24_36_500, "Active"]);
  });

  it("S-05 stale advance, PO closed, vendor inactive, no BG", () => {
    const [l] = anchored("S-05");
    expect([l.amount, age(l)]).toEqual([36_80_000, 512]);
    expect(party(l.partner!.id).status).toBe("Inactive");
    expect(po(l.po!.number).status).toBe("Closed");
    expect(world.bankGuarantees.some((b) => b.linkedPo === l.po!.number)).toBe(false);
  });

  it("S-06 / S-07 TDS deducted but never in Form 26AS", () => {
    for (const [id, amount] of [["S-06", 4_62_700], ["S-07", 2_18_940]] as const) {
      const [l] = anchored(id);
      expect([l.gl, l.amount]).toEqual(["161100", amount]);
      const quarter = fiscalQuarterLabel(l.postingDate, 4, "FY");
      expect(world.taxCredits.some((t) => t.customerId === l.partner!.id && t.taxYearQuarter === quarter && t.taxCredited === amount)).toBe(false);
    }
  });

  it("S-08 unbilled revenue on a project on hold, last billed 274 days ago", () => {
    const [l] = anchored("S-08");
    expect([l.gl, l.amount, age(l)]).toEqual(["141100", 2_86_12_400, 274]);
    expect(project(l.wbs!).stage).toBe("On hold");
    const laterBilling = world.lines.filter((x) => x.wbs === l.wbs && x.docType === "DR" && x.postingDate > l.postingDate);
    expect(laterBilling).toHaveLength(0);
  });

  it("S-09 retention with a PSU customer, DLP ended 240 days ago", () => {
    const [l] = anchored("S-09");
    expect([l.gl, l.amount]).toEqual(["142100", 1_12_47_800]);
    const p = project(l.wbs!);
    expect(p.stage).toBe("DLP ended");
    expect(daysBetween(p.dlpEnd!, world.asOf)).toBe(240);
    expect(party(l.partner!.id).governmentOrPsu).toBe(true);
  });

  it("S-10 customer advance on a closed project, 540 days", () => {
    const [l] = anchored("S-10");
    expect([l.gl, l.amount, age(l)]).toEqual(["221100", -58_40_000, 540]);
    expect(project(l.wbs!).stage).toBe("Closed");
  });

  it("S-11 receipt parked in incoming-payments clearing for 211 days", () => {
    const [l] = anchored("S-11");
    expect([l.gl, l.amount, age(l)]).toEqual(["171200", -23_60_000, 211]);
  });

  it("S-12 round manual provision at period end, entered 11:42 PM", () => {
    const [l] = anchored("S-12");
    expect([l.amount, l.manual, l.postingDate, l.entryTime]).toEqual([-25_00_000, true, world.asOf, "23:42"]);
  });

  it("S-13 credit line in a vendor-advance account", () => {
    const [l] = anchored("S-13");
    expect([l.gl, l.amount]).toEqual(["151100", -3_46_000]);
  });

  it("S-14 posting to a clearing account dormant for 14 months", () => {
    const [l] = anchored("S-14");
    expect([l.gl, l.amount]).toEqual(["171500", 9_80_000]);
    const earlier = world.lines.filter((x) => x.gl === "171500" && x.key !== l.key && x.postingDate < l.postingDate);
    const last = earlier.reduce((m, x) => (x.postingDate > m ? x.postingDate : m), "");
    expect(daysBetween(last, l.postingDate)).toBeGreaterThan(400);
  });

  it("S-15 the same assignment moved across three accounts", () => {
    const lines = anchored("S-15");
    expect(new Set(lines.map((l) => l.gl)).size).toBe(3);
    expect(new Set(lines.map((l) => l.assignment))).toEqual(new Set(["ACR-2026-0612"]));
  });

  it("S-16 TDS payable undeposited for 7 months", () => {
    const [l] = anchored("S-16");
    expect([l.gl, l.amount]).toEqual(["241200", -1_84_300]);
    expect(isOpenAt(l, world.asOf)).toBe(true);
    expect(age(l)).toBeGreaterThan(210);
  });

  it("S-18 customer balance of ₹2,40,00,000", () => {
    const lines = anchored("S-18");
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(2_40_00_000);
    const customer = lines[0].partner!.id;
    const allOpen = world.lines.filter((l) => l.partner?.id === customer && ["140100", "142100"].includes(l.gl) && isOpenAt(l, world.asOf));
    expect(allOpen.reduce((s, l) => s + l.amount, 0)).toBe(2_40_00_000);
  });

  it("S-20 performance BG expiring in 45 days", () => {
    const bg = world.bankGuarantees.find((b) => b.bgNo === world.anchors["S-20"][0])!;
    expect([bg.type, bg.amount, bg.validTo]).toEqual(["Performance", 3_50_00_000, addDays(world.asOf, 45)]);
  });

  it("S-21 EUR 5,00,000 payable booked at ₹96.00", () => {
    const [l] = anchored("S-21");
    expect([l.docCurrency, l.amountDoc, l.amount]).toEqual(["EUR", -5_00_000, -4_80_00_000]);
  });

  it("S-24 MSME invoices beyond 45 days total ₹38,90,000 - and are the only ones", () => {
    const planted = anchored("S-24");
    expect(planted.reduce((s, l) => s - l.amount, 0)).toBe(38_90_000);
    const overdue = world.lines.filter((l) => {
      if (l.gl !== "210100" || !l.partner || !isOpenAt(l, world.asOf)) return false;
      const v = party(l.partner.id);
      return (v.msme === "Micro" || v.msme === "Small") && age(l) > 45;
    });
    expect(new Set(overdue.map((l) => l.key))).toEqual(new Set(planted.map((l) => l.key)));
  });
});
