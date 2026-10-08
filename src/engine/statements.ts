// Statutory statements from the ledger (docs/FRD.md §6.13, D-57): the balance
// sheet and the statement of profit and loss in the Schedule III layout, each
// line the sum of its accounts, with comparatives and the notes the statute
// asks for. Every figure drills to its accounts and from there to documents.
// The balance sheet carries the result of the year in equity until the year is
// closed, so it balances at any month end.

import type { GlAccount, IsoDate } from "@/types";
import { BALANCES, WORLD, isOpenAt } from "@/data";
import { LOCALISATION } from "@/config/localisation";
import { TENANT } from "@/config/tenant";
import { STATEMENT_POLICY } from "@/config/policies";
import { previousQuarterEnd } from "@/engine/context";
import { addDays, fiscalYearStartDate } from "@/lib/dates";
import { windowsFor } from "@/engine/pnl";
import { receivablesAgeing, payablesAgeing, statutoryAgeing, type StatutoryBand } from "@/engine/workingCapital";

export interface AccountAmount {
  gl: string;
  description: string;
  amount: number;
  comparative: number;
}

export interface StatementLine {
  label: string;
  amount: number;
  comparative: number;
  accounts: AccountAmount[];
}

export interface StatementGroup {
  label: string;
  lines: StatementLine[];
  total: number;
  comparativeTotal: number;
}

export interface BalanceSheet {
  periodEnd: IsoDate;
  comparativeEnd: IsoDate;
  assets: StatementGroup[];
  equityAndLiabilities: StatementGroup[];
  totalAssets: number;
  totalEquityAndLiabilities: number;
  comparativeAssets: number;
  comparativeEquityAndLiabilities: number;
  /** accounts with a balance whose statement line the layout does not place: always empty when the layout is complete */
  unplaced: AccountAmount[];
}

const periods = BALANCES.periods;
const closingOf = (gl: string, periodEnd: IsoDate): number => BALANCES.byGl.get(gl)?.[periods.indexOf(periodEnd)]?.closing ?? 0;
const isPl = (g: GlAccount) => g.category === "pl";

/** The result of the fiscal year to date, a credit as a positive number. */
export function resultToDate(periodEnd: IsoDate): number {
  return -WORLD.glAccounts.filter(isPl).reduce((s, g) => s + closingOf(g.gl, periodEnd), 0);
}

/** The last day before the fiscal year of the period began: the year end the balance sheet is compared with. */
export function previousYearEnd(periodEnd: IsoDate): IsoDate {
  return addDays(fiscalYearStartDate(periodEnd, TENANT.fiscalYear.startMonth), -1);
}

/** The date the balance sheet is compared with, by policy. */
export function comparativeDate(periodEnd: IsoDate): IsoDate {
  return STATEMENT_POLICY.balanceSheetComparative === "previous-year-end" ? previousYearEnd(periodEnd) : previousQuarterEnd(periodEnd);
}

export function buildBalanceSheet(periodEnd: IsoDate, comparativeEnd: IsoDate = comparativeDate(periodEnd)): BalanceSheet {
  const byLine = new Map<string, GlAccount[]>();
  for (const g of WORLD.glAccounts) if (!isPl(g)) byLine.set(g.statementLine, [...(byLine.get(g.statementLine) ?? []), g]);
  const placed = new Set<string>();

  const lineOf = (label: string, sign: 1 | -1): StatementLine => {
    const accounts: AccountAmount[] = (byLine.get(label) ?? [])
      .map((g) => ({ gl: g.gl, description: g.description, amount: sign * closingOf(g.gl, periodEnd), comparative: sign * closingOf(g.gl, comparativeEnd) }))
      .filter((a) => a.amount !== 0 || a.comparative !== 0);
    for (const g of byLine.get(label) ?? []) placed.add(g.gl);
    // equity carries the result of the year until it is closed into retained earnings
    if (label === "Other equity") accounts.push({ gl: "", description: "Profit for the period", amount: resultToDate(periodEnd), comparative: resultToDate(comparativeEnd) });
    return { label, amount: accounts.reduce((s, a) => s + a.amount, 0), comparative: accounts.reduce((s, a) => s + a.comparative, 0), accounts };
  };

  const build = (sectionLabel: string, sign: 1 | -1): StatementGroup[] => {
    const section = LOCALISATION.scheduleIII.balanceSheet.find((s) => s.section === sectionLabel)!;
    return section.groups.map((g) => {
      const lines = g.lines.map((l) => lineOf(l, sign));
      return { label: g.label, lines, total: lines.reduce((s, l) => s + l.amount, 0), comparativeTotal: lines.reduce((s, l) => s + l.comparative, 0) };
    });
  };

  const assets = build("Assets", 1);
  const equityAndLiabilities = build("Equity and liabilities", -1);
  const unplaced = WORLD.glAccounts
    .filter((g) => !isPl(g) && !placed.has(g.gl))
    .map((g) => ({ gl: g.gl, description: g.description, amount: closingOf(g.gl, periodEnd), comparative: closingOf(g.gl, comparativeEnd) }))
    .filter((a) => a.amount !== 0 || a.comparative !== 0);
  const sum = (gs: StatementGroup[], k: "total" | "comparativeTotal") => gs.reduce((s, g) => s + g[k], 0);
  return {
    periodEnd,
    comparativeEnd,
    assets,
    equityAndLiabilities,
    totalAssets: sum(assets, "total"),
    totalEquityAndLiabilities: sum(equityAndLiabilities, "total"),
    comparativeAssets: sum(assets, "comparativeTotal"),
    comparativeEquityAndLiabilities: sum(equityAndLiabilities, "comparativeTotal"),
    unplaced,
  };
}

// ---------------------------------------------------------------------------
// Statement of profit and loss
// ---------------------------------------------------------------------------
export interface ProfitAndLoss {
  periodEnd: IsoDate;
  from: IsoDate;
  comparativeFrom: IsoDate;
  comparativeTo: IsoDate;
  income: StatementLine[];
  totalIncome: StatementLine;
  expenses: StatementLine[];
  totalExpenses: StatementLine;
  profitBeforeTax: StatementLine;
  tax: StatementLine;
  profit: StatementLine;
}

/** Income and expense accounts of the fiscal year to date, in the statutory order, with the same stretch a year earlier. */
export function buildProfitAndLoss(periodEnd: IsoDate): ProfitAndLoss {
  const w = windowsFor(periodEnd);
  const from = w.ytd.from;
  const comparativeFrom = w.prior.from;
  const comparativeTo = w.prior.to;
  const byLine = new Map<string, GlAccount[]>();
  for (const g of WORLD.glAccounts.filter(isPl)) byLine.set(g.statementLine, [...(byLine.get(g.statementLine) ?? []), g]);
  const line = (label: string, sign: 1 | -1): StatementLine => {
    const accounts = (byLine.get(label) ?? [])
      .map((g) => ({ gl: g.gl, description: g.description, amount: sign * closingOf(g.gl, periodEnd), comparative: sign * closingOf(g.gl, comparativeTo) }))
      .filter((a) => a.amount !== 0 || a.comparative !== 0);
    return { label, amount: accounts.reduce((s, a) => s + a.amount, 0), comparative: accounts.reduce((s, a) => s + a.comparative, 0), accounts };
  };
  const total = (label: string, lines: StatementLine[]): StatementLine => ({ label, amount: lines.reduce((s, l) => s + l.amount, 0), comparative: lines.reduce((s, l) => s + l.comparative, 0), accounts: [] });
  const cfg = LOCALISATION.scheduleIII.profitAndLoss;
  const income = cfg.income.map((l) => line(l, -1));
  const expenses = cfg.expenses.map((l) => line(l, 1));
  const tax = line(cfg.tax[0], 1);
  const totalIncome = total("Total income", income);
  const totalExpenses = total("Total expenses", expenses);
  const profitBeforeTax: StatementLine = { label: "Profit before tax", amount: totalIncome.amount - totalExpenses.amount, comparative: totalIncome.comparative - totalExpenses.comparative, accounts: [] };
  const profit: StatementLine = { label: "Profit for the period", amount: profitBeforeTax.amount - tax.amount, comparative: profitBeforeTax.comparative - tax.comparative, accounts: [] };
  return { periodEnd, from, comparativeFrom, comparativeTo, income, totalIncome, expenses, totalExpenses, profitBeforeTax, tax, profit };
}

// ---------------------------------------------------------------------------
// Notes: the ageing schedules Schedule III asks for
// ---------------------------------------------------------------------------
export interface Notes {
  tradeReceivables: StatutoryBand[];
  tradePayables: StatutoryBand[];
  cwip: StatutoryBand[];
}

export function buildNotes(periodEnd: IsoDate): Notes {
  const cwipGls = new Set(WORLD.glAccounts.filter((g) => g.category === "cwip").map((g) => g.gl));
  const cwipLines = WORLD.lines.filter((l) => cwipGls.has(l.gl) && l.amount > 0 && l.postingDate <= periodEnd && isOpenAt(l, periodEnd));
  return {
    tradeReceivables: receivablesAgeing(periodEnd),
    tradePayables: payablesAgeing(periodEnd),
    cwip: statutoryAgeing(cwipLines, LOCALISATION.disclosureAgeing.tradePayablesAndCwip, periodEnd),
  };
}
