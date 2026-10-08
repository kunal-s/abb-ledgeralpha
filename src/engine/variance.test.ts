import { describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { monthlyPnl, operatingProfit } from "@/engine/pnl";
import { VARIANCE_POLICY, driversOf, draftVarianceCommentary, varianceBridge, windows } from "@/engine/variance";
import { fmtINRCompact } from "@/lib/format";

const asOf = WORLD.asOf;
const months = monthlyPnl(asOf, 14);
const monthOf = (end: string) => months.find((m) => m.periodEnd === end)!;

describe("the windows", () => {
  it("compare a month with the one before, or with the same month a year earlier", () => {
    const m = windows("2026-09-30", "prior-month");
    expect(m.current).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(m.prior).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    const y = windows("2026-09-30", "prior-year");
    expect(y.prior).toEqual({ from: "2025-09-01", to: "2025-09-30" });
    expect(windows("2026-03-31", "prior-month").prior).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
});

describe("the bridge", () => {
  for (const base of ["prior-month", "prior-year"] as const) {
    const b = varianceBridge(asOf, base);

    it(`adds up to the whole variance against ${base === "prior-month" ? "last month" : "last year"}, with nothing left over`, () => {
      expect(b.residual).toBeCloseTo(0, 4);
      expect(b.priorProfit + b.components.reduce((s, c) => s + c.effect, 0)).toBeCloseTo(b.currentProfit, 2);
      expect(b.total).toBeCloseTo(b.currentProfit - b.priorProfit, 4);
    });

    it(`starts and ends at the operating profit of the profit and loss (${base})`, () => {
      expect(b.currentProfit).toBeCloseTo(operatingProfit(monthOf(asOf).total), 0);
      const priorEnd = b.prior.to;
      if (months.some((m) => m.periodEnd === priorEnd)) expect(b.priorProfit).toBeCloseTo(operatingProfit(monthOf(priorEnd).total), 0);
    });
  }

  it("places every profit and loss line of both months in one component", () => {
    const b = varianceBridge(asOf, "prior-month");
    const operating = new Set(WORLD.glAccounts.filter((g) => g.category === "pl" && ["Revenue from operations", "Cost of materials consumed", "Purchases of stock-in-trade", "Changes in inventories", "Employee benefits expense", "Depreciation and amortisation expense", "Other expenses"].includes(g.statementLine)).map((g) => g.gl));
    const n = WORLD.lines.filter((l) => operating.has(l.gl) && ((l.postingDate >= b.current.from && l.postingDate <= b.current.to) || (l.postingDate >= b.prior.from && l.postingDate <= b.prior.to))).length;
    expect(b.components.reduce((s, c) => s + c.lines, 0)).toBe(n);
  });

  it("shows the biggest expense accounts on their own and the rest together, largest movement first", () => {
    const b = varianceBridge(asOf, "prior-month");
    expect(b.components.filter((c) => c.id.startsWith("exp:") && c.id !== "exp:other").length).toBeLessThanOrEqual(VARIANCE_POLICY.expenseAccountsShown);
    const abs = b.components.map((c) => Math.abs(c.effect));
    expect(abs).toEqual([...abs].sort((a, c) => c - a));
  });

  it("separates revenue, which adds to profit, from cost, which takes from it", () => {
    const b = varianceBridge(asOf, "prior-month");
    for (const c of b.components) {
      if (c.kind === "revenue") expect(c.current).toBeGreaterThanOrEqual(0);
      if (c.kind === "cost") expect(c.current).toBeLessThanOrEqual(0);
    }
  });

  it("reads a business unit on its own, and the units add up to the company", () => {
    const company = varianceBridge(asOf, "prior-month");
    const units = WORLD.businessUnits.map((u) => varianceBridge(asOf, "prior-month", u.id));
    expect(units.reduce((s, u) => s + u.currentProfit, 0)).toBeCloseTo(company.currentProfit, 0);
    expect(units.reduce((s, u) => s + u.total, 0)).toBeCloseTo(company.total, 0);
    for (const u of units) expect(u.residual).toBeCloseTo(0, 4);
  });
});

describe("the transactions behind a movement", () => {
  const b = varianceBridge(asOf, "prior-month");

  it("are the largest postings of the month in the component, largest first", () => {
    const c = b.components[0];
    const d = driversOf(asOf, "prior-month", c.id);
    expect(d.length).toBeGreaterThan(0);
    expect(d.length).toBeLessThanOrEqual(10);
    const abs = d.map((x) => Math.abs(x.impact));
    expect(abs).toEqual([...abs].sort((a, z) => z - a));
    for (const x of d) {
      expect(x.line.postingDate >= b.current.from && x.line.postingDate <= b.current.to).toBe(true);
      expect(x.impact).toBeCloseTo(-x.line.amount, 4);
    }
  });

  it("include every account of the merged expense component", () => {
    const merged = b.components.find((c) => c.id === "exp:other");
    if (merged) expect(driversOf(asOf, "prior-month", "exp:other", "all", 50).every((d) => d.line.gl.startsWith("5"))).toBe(true);
  });
});

describe("the reading", () => {
  it("quotes the figures of the bridge and no others", () => {
    const b = varianceBridge(asOf, "prior-month");
    const t = draftVarianceCommentary(b, "prior-month");
    expect(t).toContain(fmtINRCompact(Math.abs(b.total)));
    expect(t).toContain(fmtINRCompact(b.currentProfit));
    expect(t).toContain("the month before");
    expect(draftVarianceCommentary(b, "prior-year")).toContain("the same month last year");
    expect(t.includes(String.fromCharCode(8212))).toBe(false);
    expect(t).not.toContain("not accounted for");
  });
});
