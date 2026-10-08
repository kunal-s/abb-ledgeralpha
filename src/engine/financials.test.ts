import { describe, expect, it } from "vitest";
import { BALANCES, WORLD, balanceAt } from "@/data";
import { STATEMENT_LINES } from "@/data/workspace/coa";
import { PROFIT_FOR_PERIOD_LINE, accountView, ageingNotes, balanceSheet, fiscalQuarterMonths, fiscalYearMonths, profitAndLoss } from "@/engine/financials";
import { monthsBetween } from "@/engine/pl";

const ASOF = WORLD.asOf;

describe("balance sheet", () => {
  it("balances at every month end of the year, with the profit of the year in other equity", () => {
    for (const m of monthsBetween("2026-01", "2026-09")) {
      const lastDay = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).getUTCDate();
      const date = `${m}-${String(lastDay).padStart(2, "0")}`;
      const bs = balanceSheet(date, "2025-12-31");
      expect(Math.abs(bs.difference), date).toBeLessThan(1);
      expect(bs.totalAssets).toBeCloseTo(bs.totalEquityAndLiabilities, 0);
      expect(bs.totalAssetsComparative).toBeCloseTo(bs.totalEquityAndLiabilitiesComparative, 0);
    }
  });

  it("lists every account under its line, and the lines add up to the totals", () => {
    const bs = balanceSheet(ASOF, "2026-06-30");
    for (const row of [...bs.assets, ...bs.equity, ...bs.liabilities]) {
      expect(row.accounts.reduce((s, a) => s + a.amount, 0), row.line).toBeCloseTo(row.amount, 2);
      expect(row.accounts.reduce((s, a) => s + a.comparative, 0), row.line).toBeCloseTo(row.comparative, 2);
      for (const a of row.accounts) expect(a.amount !== 0 || a.comparative !== 0, `${row.line} ${a.gl}`).toBe(true);
    }
    expect(bs.assets.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(bs.totalAssets, 2);
    expect(bs.totalEquity + bs.totalLiabilities).toBeCloseTo(bs.totalEquityAndLiabilities, 2);
    expect(bs.date).toBe(ASOF);
    expect(bs.comparativeDate).toBe("2026-06-30");
  });

  it("the profit of the year in other equity is the year's profit and loss, to the rupee", () => {
    const bs = balanceSheet(ASOF, "2026-06-30");
    const other = bs.equity.find((r) => r.line === "Other equity")!;
    const profit = other.accounts.find((a) => a.description === PROFIT_FOR_PERIOD_LINE)!;
    const { from, to } = fiscalYearMonths(ASOF, 1);
    expect(profit.amount).toBeCloseTo(profitAndLoss(from, to).profit, 0);
    expect(profit.comparative).toBeCloseTo(profitAndLoss(from, "2026-06").profit, 0);
  });

  it("maps every account to a line of the statements, so none is left out of a total", () => {
    const lines = new Set<string>([...STATEMENT_LINES.balanceSheet, ...STATEMENT_LINES.profitAndLoss]);
    for (const g of WORLD.glAccounts) expect(lines.has(g.statementLine), `${g.gl} ${g.statementLine}`).toBe(true);
    const trialBalance = WORLD.glAccounts.reduce((s, g) => s + (balanceAt(BALANCES, g.gl, ASOF)?.closing ?? 0), 0);
    expect(Math.abs(trialBalance)).toBeLessThan(1);
  });
});

describe("statement of profit and loss", () => {
  it("income less expenses less tax is the profit, and the lines add up", () => {
    const pl = profitAndLoss("2026-07", "2026-09");
    expect(pl.totalIncome - pl.totalExpenses).toBeCloseTo(pl.profitBeforeTax, 2);
    expect(pl.profitBeforeTax - pl.tax.amount).toBeCloseTo(pl.profit, 2);
    expect(pl.income.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(pl.totalIncome, 2);
    expect(pl.expenses.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(pl.totalExpenses, 2);
    for (const r of [...pl.income, ...pl.expenses, pl.tax]) expect(r.accounts.reduce((s, a) => s + a.amount, 0), r.line).toBeCloseTo(r.amount, 2);
    expect(pl.profit).toBeGreaterThan(0);
  });

  it("compares with the same months of the year before", () => {
    const pl = profitAndLoss("2026-07", "2026-09");
    expect([pl.comparativeFrom, pl.comparativeTo]).toEqual(["2025-07", "2025-09"]);
    expect(pl.totalIncomeComparative).toBeGreaterThan(0);
    expect(pl.totalIncome).toBeGreaterThan(pl.totalIncomeComparative);
  });

  it("the three quarters of the year add up to the year to date", () => {
    const q = ["2026-01|2026-03", "2026-04|2026-06", "2026-07|2026-09"].map((r) => profitAndLoss(r.split("|")[0], r.split("|")[1]));
    const ytd = profitAndLoss("2026-01", "2026-09");
    expect(q.reduce((s, p) => s + p.totalIncome, 0)).toBeCloseTo(ytd.totalIncome, 2);
    expect(q.reduce((s, p) => s + p.profit, 0)).toBeCloseTo(ytd.profit, 2);
  });
});

describe("notes", () => {
  it("each ageing note agrees to its balance sheet line", () => {
    const notes = ageingNotes(ASOF);
    expect(notes.map((n) => n.statementLine)).toEqual(["Trade receivables", "Trade payables", "Capital work-in-progress"]);
    const bs = balanceSheet(ASOF, "2026-06-30");
    const lines = new Map([...bs.assets, ...bs.liabilities].map((r) => [r.line, r.amount]));
    for (const n of notes) {
      expect(Math.abs(n.difference), n.title).toBeLessThan(1);
      expect(n.perBalanceSheet, n.title).toBeCloseTo(lines.get(n.statementLine)!, 0);
      expect(n.bands.reduce((s, b) => s + b.amount, 0), n.title).toBeCloseTo(n.total, 2);
      expect(n.bands.length, n.title).toBeGreaterThanOrEqual(4);
    }
  });
});

describe("account behind a line", () => {
  it("shows the month-end balances of the year and the postings, newest first", () => {
    const v = accountView("140100", "2026-01-01", ASOF)!;
    expect(v.trend.map((t) => t.month)).toEqual(monthsBetween("2026-01", "2026-09"));
    expect(v.trend.at(-1)!.closing).toBe(balanceAt(BALANCES, "140100", ASOF)!.closing);
    expect(v.count).toBeGreaterThanOrEqual(v.postings.length);
    expect(v.postings.length).toBeLessThanOrEqual(100);
    for (let i = 1; i < v.postings.length; i += 1) expect(v.postings[i - 1].postingDate >= v.postings[i].postingDate).toBe(true);
    expect(accountView("999999", "2026-01-01", ASOF)).toBeUndefined();
  });
});

describe("fiscal periods", () => {
  it("finds the quarter and the year-to-date of a date, in a calendar-year and an April fiscal year", () => {
    expect(fiscalQuarterMonths("2026-09-30", 1)).toEqual({ from: "2026-07", to: "2026-09" });
    expect(fiscalQuarterMonths("2026-02-15", 1)).toEqual({ from: "2026-01", to: "2026-03" });
    expect(fiscalQuarterMonths("2026-05-10", 4)).toEqual({ from: "2026-04", to: "2026-06" });
    expect(fiscalQuarterMonths("2026-02-10", 4)).toEqual({ from: "2026-01", to: "2026-03" });
    expect(fiscalYearMonths("2026-09-30", 1)).toEqual({ from: "2026-01", to: "2026-09" });
    expect(fiscalYearMonths("2026-09-30", 4)).toEqual({ from: "2026-04", to: "2026-09" });
    expect(fiscalYearMonths("2026-02-10", 4)).toEqual({ from: "2025-04", to: "2026-02" });
  });
});
