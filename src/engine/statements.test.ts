import { describe, expect, it } from "vitest";
import { BALANCES, WORLD } from "@/data";
import { buildBalanceSheet, buildNotes, buildProfitAndLoss, comparativeDate, previousYearEnd, resultToDate } from "@/engine/statements";
import { pnlByBusinessUnit, result, sumPl } from "@/engine/pnl";
import { receivablesAgeing } from "@/engine/workingCapital";

const asOf = WORLD.asOf;

describe("balance sheet", () => {
  const bs = buildBalanceSheet(asOf);

  it("balances at the period end and at the comparative date", () => {
    expect(bs.totalAssets).toBeCloseTo(bs.totalEquityAndLiabilities, 0);
    expect(bs.comparativeAssets).toBeCloseTo(bs.comparativeEquityAndLiabilities, 0);
    expect(bs.totalAssets).toBeGreaterThan(0);
  });

  it("balances at every month end of the year, because equity carries the result of the year", () => {
    for (const p of BALANCES.periods.slice(-14)) {
      const b = buildBalanceSheet(p);
      expect(b.totalAssets).toBeCloseTo(b.totalEquityAndLiabilities, 0);
    }
  });

  it("places every account with a balance in exactly one line", () => {
    expect(bs.unplaced).toEqual([]);
    const seen = new Map<string, number>();
    for (const g of [...bs.assets, ...bs.equityAndLiabilities]) for (const l of g.lines) for (const a of l.accounts) if (a.gl) seen.set(a.gl, (seen.get(a.gl) ?? 0) + 1);
    for (const n of seen.values()) expect(n).toBe(1);
  });

  it("makes each line the sum of its accounts and each group the sum of its lines", () => {
    for (const g of [...bs.assets, ...bs.equityAndLiabilities]) {
      expect(g.total).toBeCloseTo(g.lines.reduce((s, l) => s + l.amount, 0), 2);
      for (const l of g.lines) expect(l.amount).toBeCloseTo(l.accounts.reduce((s, a) => s + a.amount, 0), 2);
    }
  });

  it("compares with the last year end, and carries the profit of the period in equity", () => {
    expect(bs.comparativeEnd).toBe(comparativeDate(asOf));
    expect(bs.comparativeEnd).toBe("2026-06-30");
    expect(previousYearEnd(asOf)).toBe("2025-12-31");
    expect(buildBalanceSheet(asOf, previousYearEnd(asOf)).comparativeEnd).toBe("2025-12-31");
    const equity = bs.equityAndLiabilities.find((g) => g.label === "Equity")!.lines.find((l) => l.label === "Other equity")!;
    expect(equity.accounts.find((a) => a.description === "Profit for the period")!.amount).toBeCloseTo(resultToDate(asOf), 2);
  });
});

describe("statement of profit and loss", () => {
  const pl = buildProfitAndLoss(asOf);
  const mgmt = sumPl(pnlByBusinessUnit(asOf).map((r) => r.current));
  const mgmtPrior = sumPl(pnlByBusinessUnit(asOf).map((r) => r.prior));

  it("agrees with the management profit and loss, this year and last", () => {
    expect(pl.income[0].amount).toBeCloseTo(mgmt.revenue, 0);
    expect(pl.income[0].comparative).toBeCloseTo(mgmtPrior.revenue, 0);
    expect(pl.profit.amount).toBeCloseTo(result(mgmt), 0);
    expect(pl.profit.comparative).toBeCloseTo(result(mgmtPrior), 0);
  });

  it("is the same profit the balance sheet carries in equity", () => {
    expect(pl.profit.amount).toBeCloseTo(resultToDate(asOf), 0);
  });

  it("adds income less expenses less tax", () => {
    expect(pl.profitBeforeTax.amount).toBeCloseTo(pl.totalIncome.amount - pl.totalExpenses.amount, 2);
    expect(pl.profit.amount).toBeCloseTo(pl.profitBeforeTax.amount - pl.tax.amount, 2);
    expect(pl.totalExpenses.amount).toBeCloseTo(pl.expenses.reduce((s, l) => s + l.amount, 0), 2);
  });
});

describe("notes", () => {
  it("ages receivables the way the working capital view does, and puts every item in a band", () => {
    const n = buildNotes(asOf);
    expect(n.tradeReceivables).toEqual(receivablesAgeing(asOf));
    expect(n.cwip.reduce((s, b) => s + b.count, 0)).toBeGreaterThan(0);
    expect(n.tradePayables.length).toBe(4);
  });
});
