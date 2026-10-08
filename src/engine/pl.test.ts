import { describe, expect, it } from "vitest";
import { GL_BY_ID, WORLD } from "@/data";
import { BUDGET_PLAN } from "@/data/workspace/budget";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { budgetMonth, budgetRange, hasBudget } from "@/engine/budget";
import { profitAndLoss } from "@/engine/financials";
import { COMPANY, addRows, emptyRow, margin, monthsBetween, operatingResult, parseScope, plMonth, plRange, scopeKey, scopePcs, shiftMonth, type PlRow } from "@/engine/pl";

const MONTHS = monthsBetween("2025-01", "2026-09");
const ALL = scopePcs(COMPANY);
const BUS = WORLD.businessUnits.map((b) => b.id);

/** Profit after tax as the report lines give it: the operating result plus interest, less tax. */
const profitOf = (r: PlRow) => operatingResult(r) + r.interest - r.tax;

describe("report lines (the P&L cube)", () => {
  it("every month's profit equals the sum of its profit and loss postings, so no account is lost between ledger and report", () => {
    for (const m of monthsBetween("2026-01", "2026-09")) {
      let net = 0;
      for (const l of WORLD.lines) if (l.postingDate.startsWith(m) && GL_BY_ID.get(l.gl)?.category === "pl") net += l.amount;
      expect(Math.abs(profitOf(plMonth(m, ALL)) + net), m).toBeLessThan(0.01);
    }
  });

  it("agrees with the statement of profit and loss built from the trial balance, month by month", () => {
    for (const m of monthsBetween("2026-01", "2026-09")) {
      expect(Math.abs(profitOf(plMonth(m, ALL)) - profitAndLoss(m, m).profit), m).toBeLessThan(0.01);
    }
  });

  it("the company is the sum of its business units and of its profit centres, in every month", () => {
    for (const m of MONTHS) {
      const company = plMonth(m, ALL);
      const byBu = BUS.reduce((acc, id) => addRows(acc, plMonth(m, scopePcs({ kind: "bu", id }))), emptyRow());
      const byPc = ALL.reduce((acc, id) => addRows(acc, plMonth(m, [id])), emptyRow());
      for (const k of Object.keys(company) as (keyof PlRow)[]) {
        expect(Math.abs(company[k] - byBu[k]), `${m} ${k} by unit`).toBeLessThan(0.01);
        expect(Math.abs(company[k] - byPc[k]), `${m} ${k} by profit centre`).toBeLessThan(0.01);
      }
    }
  });

  it("a range is the sum of its months", () => {
    const sum = monthsBetween("2026-01", "2026-09").reduce((acc, m) => addRows(acc, plMonth(m, ALL)), emptyRow());
    expect(plRange("2026-01", "2026-09", ALL)).toEqual(sum);
  });

  it("has revenue and costs of a believable size, with priced revenue a part of revenue", () => {
    for (const m of monthsBetween("2026-01", "2026-09")) {
      const r = plMonth(m, ALL);
      expect(r.revenue, m).toBeGreaterThan(0);
      expect(r.pricedRevenue, m).toBeGreaterThan(0);
      expect(r.pricedRevenue, m).toBeLessThan(r.revenue);
      const mg = margin(r)!;
      expect(mg, m).toBeGreaterThan(-0.1);
      expect(mg, m).toBeLessThan(0.4);
    }
  });

  it("margin is undefined without revenue, as at corporate", () => {
    const corporate = WORLD.profitCentres.filter((p) => !S.profitCentres.some((s) => s.id === p.id)).map((p) => p.id);
    expect(corporate.length).toBeGreaterThan(0);
    expect(margin(plMonth("2026-09", corporate))).toBeUndefined();
  });

  it("the exchange differences and the one-offs are on their own lines", () => {
    const sep = plMonth("2026-09", ALL);
    expect(sep.fxLoss).toBe(6_80_000);
    expect(sep.oneOffExpense).toBeGreaterThanOrEqual(25_00_000);
    expect(operatingResult(sep)).toBe(sep.revenue + sep.fxGain + sep.oneOffIncome - sep.material - sep.employee - sep.depreciation - sep.other - sep.fxLoss - sep.oneOffExpense);
  });

  it("scope keys round trip, and an unknown key is the company", () => {
    expect(parseScope(scopeKey({ kind: "bu", id: "MO" }))).toEqual({ kind: "bu", id: "MO" });
    expect(parseScope(scopeKey({ kind: "pc", id: "PC-MO-03" }))).toEqual({ kind: "pc", id: "PC-MO-03" });
    expect(parseScope("pc:nope")).toEqual(COMPANY);
    expect(parseScope(null)).toEqual(COMPANY);
  });

  it("moves months across year ends", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2025-12", 1)).toBe("2026-01");
    expect(shiftMonth("2026-09", -12)).toBe("2025-09");
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("budget", () => {
  it("exists only in the budget year", () => {
    expect(hasBudget("2025-12")).toBe(false);
    expect(hasBudget(BUDGET_PLAN.from)).toBe(true);
    expect(hasBudget(BUDGET_PLAN.to)).toBe(true);
    expect(hasBudget("2027-01")).toBe(false);
    expect(budgetMonth("2025-12", ALL)).toEqual(emptyRow());
  });

  it("plans the revenue of the specification by profit centre and season", () => {
    const weights = S.profitCentres.reduce((s, p) => s + p.weight, 0);
    for (const m of monthsBetween(BUDGET_PLAN.from, BUDGET_PLAN.to)) {
      const planned = S.monthlyRevenue2026 * weights * S.seasonality[Number(m.slice(5)) - 1];
      expect(Math.abs(budgetMonth(m, ALL).revenue - planned), m).toBeLessThan(1);
    }
  });

  it("a profit centre's plan is its share, and a range is the sum of its months", () => {
    for (const bu of BUS) {
      const pcs = scopePcs({ kind: "bu", id: bu });
      const parts = pcs.reduce((acc, id) => addRows(acc, budgetMonth("2026-05", [id])), emptyRow());
      const whole = budgetMonth("2026-05", pcs);
      for (const k of Object.keys(whole) as (keyof PlRow)[]) expect(Math.abs(whole[k] - parts[k]), `${bu} ${k}`).toBeLessThan(0.01);
    }
    const months = monthsBetween("2026-01", "2026-09").reduce((acc, m) => addRows(acc, budgetMonth(m, ALL)), emptyRow());
    const range = budgetRange("2026-01", "2026-09", ALL);
    for (const k of Object.keys(range) as (keyof PlRow)[]) expect(Math.abs(range[k] - months[k]), k).toBeLessThan(0.01);
  });

  it("plans a profit, below the revenue it plans, and carries corporate costs without revenue", () => {
    const b = budgetMonth("2026-09", ALL);
    expect(operatingResult(b)).toBeGreaterThan(0);
    expect(b.material).toBeLessThan(b.revenue);
    const corporate = WORLD.profitCentres.filter((p) => !S.profitCentres.some((s) => s.id === p.id)).map((p) => p.id);
    const c = budgetMonth("2026-09", corporate);
    expect(c.revenue).toBe(0);
    expect(c.employee + c.other).toBeGreaterThan(0);
  });
});
