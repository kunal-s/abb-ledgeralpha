import { describe, expect, it } from "vitest";
import { BALANCES, WORLD } from "@/data";
import { grossMargin, monthlyPnl, operatingProfit, pnlByBusinessUnit, projectMargins, result, sumPl, windowsFor, type PlGroup } from "@/engine/pnl";

const asOf = WORLD.asOf;
const line = (name: string) => WORLD.glAccounts.filter((g) => g.statementLine === name).map((g) => g.gl);
const GROUPS: Record<PlGroup, string[]> = {
  revenue: line("Revenue from operations"),
  otherIncome: line("Other income"),
  materials: [...line("Cost of materials consumed"), ...line("Purchases of stock-in-trade"), ...line("Changes in inventories")],
  employee: line("Employee benefits expense"),
  depreciation: line("Depreciation and amortisation expense"),
  other: line("Other expenses"),
  tax: line("Tax expense"),
};
const closing = (gls: string[], periodEnd: string) => {
  const i = BALANCES.periods.indexOf(periodEnd);
  return gls.reduce((s, gl) => s + (BALANCES.byGl.get(gl)?.[i]?.closing ?? 0), 0);
};

describe("profit and loss by business unit", () => {
  const rows = pnlByBusinessUnit(asOf);
  const cur = sumPl(rows.map((r) => r.current));
  const prior = sumPl(rows.map((r) => r.prior));

  it("ties every group to the trial balance for the year to date", () => {
    for (const g of Object.keys(GROUPS) as PlGroup[]) {
      const bal = closing(GROUPS[g], asOf);
      expect(cur[g]).toBeCloseTo(g === "revenue" || g === "otherIncome" ? -bal : bal, 0);
    }
  });

  it("ties the same stretch a year earlier to the trial balance of that date", () => {
    const w = windowsFor(asOf);
    for (const g of ["revenue", "materials", "employee", "other"] as PlGroup[]) {
      const bal = closing(GROUPS[g], w.prior.to);
      expect(prior[g]).toBeCloseTo(g === "revenue" ? -bal : bal, 0);
    }
    expect(prior.revenue).toBeGreaterThan(0);
  });

  it("makes the result the opposite of the profit and loss accounts in the trial balance", () => {
    const all = Object.values(GROUPS).flat();
    expect(result(cur)).toBeCloseTo(-closing(all, asOf), 0);
    expect(operatingProfit(cur) - grossMargin(cur)).toBeCloseTo(-(cur.employee + cur.depreciation + cur.other), 4);
  });

  it("lists the business units largest revenue first, each with its own revenue", () => {
    const rev = rows.map((r) => r.current.revenue);
    expect(rev).toEqual([...rev].sort((a, b) => b - a));
    expect(rows.filter((r) => r.current.revenue > 0).length).toBeGreaterThanOrEqual(4);
  });
});

describe("profit and loss by month", () => {
  const months = monthlyPnl(asOf, 12);
  const cur = sumPl(pnlByBusinessUnit(asOf).map((r) => r.current));

  it("runs month by month to the period, in order", () => {
    expect(months).toHaveLength(12);
    expect(months[11].periodEnd).toBe(asOf);
    for (let i = 1; i < months.length; i += 1) expect(months[i].periodEnd > months[i - 1].periodEnd).toBe(true);
  });

  it("adds up to the year to date, and the units add up to the month", () => {
    const w = windowsFor(asOf);
    const inYear = months.filter((m) => m.periodEnd >= w.ytd.from);
    expect(inYear.reduce((s, m) => s + m.total.revenue, 0)).toBeCloseTo(cur.revenue, 0);
    for (const m of months) expect(Object.values(m.byBusinessUnit).reduce((s, p) => s + p.revenue, 0)).toBeCloseTo(m.total.revenue, 2);
  });
});

describe("project margins", () => {
  const projects = projectMargins(asOf);

  it("takes each project's revenue and cost from the lines carrying its WBS", () => {
    expect(projects.length).toBeGreaterThan(20);
    const p = projects[0];
    const revenue = WORLD.lines.filter((l) => l.wbs === p.project.wbs && GROUPS.revenue.includes(l.gl) && l.postingDate <= asOf).reduce((s, l) => s - l.amount, 0);
    expect(p.revenue).toBeCloseTo(revenue, 2);
    expect(p.margin).toBeCloseTo(p.revenue - p.cost, 2);
  });

  it("estimates the cost at completion from the share recognised, and nothing when none is", () => {
    for (const p of projects) {
      expect(Number.isFinite(p.estimateAtCompletion)).toBe(true);
      if (p.recognised > 0) expect(p.estimateAtCompletion).toBeCloseTo(p.cost / p.recognised, 2);
      else expect(p.estimateAtCompletion).toBe(0);
    }
  });

  it("shows a margin only for projects with cost on them, and keeps contracts at least as large as the revenue booked", () => {
    expect(projects.filter((p) => p.costBooked).length).toBeGreaterThan(80);
    for (const p of projects) {
      expect(p.costBooked).toBe(p.cost > 0);
      if (!p.costBooked) expect(p.estimateAtCompletion).toBe(0);
    }
    const planted = new Set(Object.values(WORLD.anchors).flat());
    for (const p of projects) if (!planted.has(p.project.wbs) && p.revenue > 0) expect(p.contractValue).toBeGreaterThanOrEqual(p.revenue);
  });

  it("lists the largest revenue first", () => {
    const r = projects.map((p) => p.revenue);
    expect(r).toEqual([...r].sort((a, b) => b - a));
  });
});
