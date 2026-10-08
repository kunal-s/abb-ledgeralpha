import { describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { COMPANY, monthsBetween, scopePcs, type Scope } from "@/engine/pl";
import { COMPARATORS, bridge, canCompare, drivers, draftCommentary, planPriceIndex, ppvOf, priceIndex, projectNameOf, receiptsIn, type ComponentId } from "@/engine/variance";

const SCOPES: Scope[] = [
  COMPANY,
  ...WORLD.businessUnits.map((b): Scope => ({ kind: "bu", id: b.id })),
  ...WORLD.profitCentres.map((p): Scope => ({ kind: "pc", id: p.id })),
];
const MONTHS = monthsBetween("2026-01", "2026-09");
const effect = (r: ReturnType<typeof bridge>, id: ComponentId) => r.components.find((c) => c.id === id)!.effect;
const S22 = WORLD.anchors["S-22"][0];
const MOTION: Scope = { kind: "bu", id: "MO" };
const TRACTION: Scope = { kind: "pc", id: "PC-MO-03" };

describe("variance bridge (FR-VAR-01)", () => {
  it("the components add up to the change in the operating result, for every scope, month and comparator", () => {
    for (const comparator of COMPARATORS.map((c) => c.key)) {
      for (const month of MONTHS) {
        if (!canCompare(month, comparator)) continue;
        for (const scope of SCOPES) {
          const r = bridge(scope, month, comparator);
          expect(Math.abs(r.residual), `${JSON.stringify(scope)} ${month} ${comparator}`).toBeLessThan(0.01);
          expect(Math.abs(r.components.reduce((s, c) => s + c.effect, 0) - r.delta)).toBeLessThan(0.01);
          expect(r.delta).toBeCloseTo(r.resultCurrent - r.resultBase, 2);
        }
      }
    }
  });

  it("has the same nine components in the same order for every bridge", () => {
    const ids = bridge(COMPANY, "2026-09", "prior-month").components.map((c) => c.id);
    expect(ids).toEqual(["price", "volume", "material-price", "material-usage", "employee", "depreciation", "fx", "one-offs", "other"]);
    for (const c of bridge(MOTION, "2026-05", "budget").components) expect(c.definition.length, c.id).toBeGreaterThan(20);
  });

  it("a scope's bridge is the sum of its parts for every component that does not depend on the scope's mix", () => {
    for (const id of ["employee", "depreciation", "fx", "one-offs", "other", "material-price"] as ComponentId[]) {
      const whole = effect(bridge(COMPANY, "2026-09", "prior-month"), id);
      const parts = WORLD.businessUnits.reduce((s, b) => s + effect(bridge({ kind: "bu", id: b.id }, "2026-09", "prior-month"), id), 0);
      expect(Math.abs(whole - parts), id).toBeLessThan(0.01);
    }
  });

  it("Motion's margin in September is below August, and its material price carries the copper", () => {
    const r = bridge(MOTION, "2026-09", "prior-month");
    expect(r.marginCurrent!).toBeLessThan(r.marginBase!);
    expect(r.delta).toBeLessThan(0);
    expect(effect(r, "material-price")).toBeLessThan(-44_00_000);
    expect(r.ppv.current).toBeGreaterThan(r.ppv.base);
  });

  it("the purchase price variance among the largest transactions is the S-22 copper", () => {
    const top = drivers(TRACTION, "2026-09", "prior-month");
    const d = top.find((x) => x.lineKey === S22);
    expect(d, "S-22 line is a driver").toBeDefined();
    expect(d!.kind).toBe("material-price");
    expect(d!.effect).toBe(-44_00_000);
    expect(projectNameOf(d!)).toBeTruthy();
    expect(d!.po).toBeDefined();
    // ranked by the size of the effect
    for (let i = 1; i < top.length; i += 1) expect(Math.abs(top[i - 1].effect)).toBeGreaterThanOrEqual(Math.abs(top[i].effect));
    // the one-off of the month is a driver too, with its own document
    const company = drivers(COMPANY, "2026-09", "prior-month", 20);
    expect(company.some((x) => x.kind === "one-off")).toBe(true);
    expect(company.filter((x) => x.kind === "material-price").length).toBeGreaterThan(3);
  });

  it("a driver of the prior month counts against the result with the opposite sign", () => {
    const sep = drivers(COMPANY, "2026-09", "prior-month", 200);
    const aug = sep.filter((d) => d.month === "2026-08");
    expect(aug.length).toBeGreaterThan(0);
    const augReceipt = receiptsIn("2026-08", scopePcs(COMPANY)).find((r) => ppvOf(r) !== 0);
    if (augReceipt) expect(sep.find((d) => d.lineKey === augReceipt.lineKey)?.effect).toBeCloseTo(ppvOf(augReceipt), 2);
    // against the budget only the month itself is a driver
    expect(drivers(COMPANY, "2026-09", "budget", 200).every((d) => d.month === "2026-09")).toBe(true);
  });

  it("purchase price variance is read from priced receipts only", () => {
    const month = "2026-09";
    const all = scopePcs(COMPANY);
    const direct = WORLD.pricedReceipts.filter((r) => r.postingDate.startsWith(month)).reduce((s, r) => s + ppvOf(r), 0);
    expect(bridge(COMPANY, month, "prior-month").ppv.current).toBeCloseTo(direct, 2);
    expect(receiptsIn(month, all).length).toBe(WORLD.pricedReceipts.filter((r) => r.postingDate.startsWith(month)).length);
    expect(bridge(COMPANY, month, "budget").ppv.base).toBe(0);
  });

  it("the price effect appears when a list price action takes effect, and not otherwise", () => {
    // Electrification: +2.0 percent from 1 April 2026
    const el: Scope = { kind: "bu", id: "EL" };
    const apr = effect(bridge(el, "2026-04", "prior-month"), "price");
    expect(apr).toBeGreaterThan(0);
    expect(effect(bridge(el, "2026-05", "prior-month"), "price")).toBe(0);
    expect(effect(bridge(el, "2026-03", "prior-month"), "price")).toBe(0);
    // Motion: +1.5 percent from 1 July
    expect(effect(bridge(MOTION, "2026-07", "prior-month"), "price")).toBeGreaterThan(0);
    expect(effect(bridge(MOTION, "2026-09", "prior-month"), "price")).toBe(0);
    // against the budget the level the plan assumed is the end of the previous year, so both Motion actions count
    expect(effect(bridge(MOTION, "2026-09", "budget"), "price")).toBeGreaterThan(0);
    // a business unit with no list action has no price effect against anything
    const noAction = WORLD.businessUnits.find((b) => priceIndex(`${WORLD.profitCentres.find((p) => p.businessUnitId === b.id)!.id}`, "2026-09") === 1);
    expect(noAction).toBeDefined();
    for (const comparator of ["prior-month", "budget"] as const) expect(effect(bridge({ kind: "bu", id: noAction!.id }, "2026-09", comparator), "price")).toBe(0);
  });

  it("the price level compounds the actions in force", () => {
    const mo = WORLD.profitCentres.find((p) => p.businessUnitId === "MO")!.id;
    expect(planPriceIndex(mo)).toBe(1);
    expect(priceIndex(mo, "2026-06")).toBeCloseTo(1.015, 6);
    expect(priceIndex(mo, "2026-07")).toBeCloseTo(1.015 * 1.015, 6);
  });

  it("the budget comparator exists only in the budget year", () => {
    expect(canCompare("2025-12", "budget")).toBe(false);
    expect(canCompare("2026-09", "budget")).toBe(true);
    expect(canCompare("2025-12", "prior-month")).toBe(true);
    const r = bridge(COMPANY, "2026-09", "budget");
    expect(r.baseLabel).toBe("budget");
    expect(r.base.revenue).toBeGreaterThan(0);
  });
});

describe("drafted commentary", () => {
  it("states the result, the margins, the largest drags and the largest item, from the bridge alone", () => {
    const r = bridge(MOTION, "2026-09", "prior-month");
    const text = draftCommentary(r);
    expect(text).toContain("Motion");
    expect(text).toContain("Sep 2026");
    expect(text).toContain("Aug 2026");
    expect(text).toContain("fell by");
    expect(text).toContain("largest drags");
    expect(text).toContain("copper winding wire");
    expect(text).toContain("Purchase price variance");
    expect(text.endsWith(".")).toBe(true);
    expect(text.includes(String.fromCharCode(0x2014))).toBe(false);
  });

  it("names the project when the largest item belongs to one, and the budget when it is the comparator", () => {
    const r = bridge(TRACTION, "2026-09", "prior-month");
    const top = r.drivers[0];
    if (projectNameOf(top)) expect(draftCommentary(r)).toContain(`on project ${projectNameOf(top)}`);
    expect(draftCommentary(bridge(COMPANY, "2026-09", "budget"))).toContain("against a budget of");
  });

  it("is the same text every time for the same bridge", () => {
    expect(draftCommentary(bridge(COMPANY, "2026-08", "prior-month"))).toBe(draftCommentary(bridge(COMPANY, "2026-08", "prior-month")));
  });
});
