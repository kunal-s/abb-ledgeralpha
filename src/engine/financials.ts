// Financial statements (docs/FRD.md §6.13): the balance sheet and the
// statement of profit and loss in the statutory format, built from the trial
// balance by the statement-line mapping of the chart of accounts, with
// comparatives and the notes the ledger supports. Every line lists its accounts.

import type { GlAccount, IsoDate, LineItem } from "@/types";
import { BALANCES, GL_BY_ID, WORLD, balanceAt, isOpenAt } from "@/data";
import { STATEMENT_LINES } from "@/data/workspace/coa";
import { LOCALISATION } from "@/config/localisation";
import { monthOf, monthsBetween, shiftMonth } from "@/engine/pl";
import { WC_GLS, statutoryAgeing, type AgeingRow } from "@/engine/workingCapital";
import { daysBetween } from "@/lib/dates";

export interface StatementAccount {
  gl: string;
  description: string;
  amount: number;
  comparative: number;
}

export interface StatementRow {
  line: string;
  accounts: StatementAccount[];
  amount: number;
  comparative: number;
}

const ASSET_LINES: readonly string[] = STATEMENT_LINES.balanceSheet.slice(0, 10);
const EQUITY_LINES: readonly string[] = ["Equity share capital", "Other equity"];

export const PROFIT_FOR_PERIOD_LINE = "Profit for the period";

export interface BalanceSheet {
  date: IsoDate;
  comparativeDate: IsoDate;
  assets: StatementRow[];
  equity: StatementRow[];
  liabilities: StatementRow[];
  totalAssets: number;
  totalAssetsComparative: number;
  totalEquity: number;
  totalLiabilities: number;
  totalEquityAndLiabilities: number;
  totalEquityAndLiabilitiesComparative: number;
  /** assets less equity and liabilities: zero when the books balance */
  difference: number;
}

const closing = (gl: string, date: IsoDate): number => balanceAt(BALANCES, gl, date)?.closing ?? 0;

/** The profit of the fiscal year to a date, as the P&L accounts hold it (income is a credit). */
function profitToDate(date: IsoDate): number {
  let net = 0;
  for (const g of WORLD.glAccounts) if (g.category === "pl") net += closing(g.gl, date);
  return -net;
}

/** The balance sheet at a date against a comparative date (by default the end of the previous fiscal year). */
export function balanceSheet(date: IsoDate, comparativeDate: IsoDate): BalanceSheet {
  const byLine = new Map<string, GlAccount[]>();
  for (const g of WORLD.glAccounts) {
    if (g.category === "pl") continue;
    const list = byLine.get(g.statementLine) ?? [];
    list.push(g);
    byLine.set(g.statementLine, list);
  }
  const row = (line: string, sign: 1 | -1): StatementRow => {
    const accounts = (byLine.get(line) ?? [])
      .map((g): StatementAccount => ({ gl: g.gl, description: g.description, amount: sign * closing(g.gl, date), comparative: sign * closing(g.gl, comparativeDate) }))
      .filter((a) => a.amount !== 0 || a.comparative !== 0);
    return { line, accounts, amount: accounts.reduce((s, a) => s + a.amount, 0), comparative: accounts.reduce((s, a) => s + a.comparative, 0) };
  };
  const assets = ASSET_LINES.map((l) => row(l, 1));
  const equity = EQUITY_LINES.map((l) => row(l, -1));
  // the profit of the year so far belongs to other equity until the year closes
  const other = equity.find((r) => r.line === "Other equity")!;
  const profit: StatementAccount = { gl: "", description: PROFIT_FOR_PERIOD_LINE, amount: profitToDate(date), comparative: profitToDate(comparativeDate) };
  other.accounts.push(profit);
  other.amount += profit.amount;
  other.comparative += profit.comparative;
  const liabilities = STATEMENT_LINES.balanceSheet.filter((l) => !ASSET_LINES.includes(l) && !EQUITY_LINES.includes(l)).map((l) => row(l, -1));

  const sum = (rows: StatementRow[], k: "amount" | "comparative") => rows.reduce((s, r) => s + r[k], 0);
  const totalAssets = sum(assets, "amount");
  const totalEquity = sum(equity, "amount");
  const totalLiabilities = sum(liabilities, "amount");
  return {
    date, comparativeDate, assets, equity, liabilities,
    totalAssets, totalAssetsComparative: sum(assets, "comparative"), totalEquity, totalLiabilities,
    totalEquityAndLiabilities: totalEquity + totalLiabilities,
    totalEquityAndLiabilitiesComparative: sum(equity, "comparative") + sum(liabilities, "comparative"),
    difference: totalAssets - totalEquity - totalLiabilities,
  };
}

export interface ProfitAndLoss {
  /** "2026-07" to "2026-09" */
  from: string;
  to: string;
  comparativeFrom: string;
  comparativeTo: string;
  income: StatementRow[];
  expenses: StatementRow[];
  tax: StatementRow;
  totalIncome: number;
  totalIncomeComparative: number;
  totalExpenses: number;
  totalExpensesComparative: number;
  profitBeforeTax: number;
  profitBeforeTaxComparative: number;
  profit: number;
  profitComparative: number;
}

/** Net debits less credits of an account over a range of months. */
function movement(gl: string, from: string, to: string): number {
  const rows = BALANCES.byGl.get(gl) ?? [];
  let sum = 0;
  for (const b of rows) if (monthOf(b.periodEnd) >= from && monthOf(b.periodEnd) <= to) sum += b.debits + b.credits;
  return sum;
}

const INCOME_LINES: readonly string[] = ["Revenue from operations", "Other income"];

export function profitAndLoss(from: string, to: string): ProfitAndLoss {
  const cFrom = shiftMonth(from, -12);
  const cTo = shiftMonth(to, -12);
  const byLine = new Map<string, GlAccount[]>();
  for (const g of WORLD.glAccounts) {
    if (g.category !== "pl") continue;
    const list = byLine.get(g.statementLine) ?? [];
    list.push(g);
    byLine.set(g.statementLine, list);
  }
  const row = (line: string): StatementRow => {
    const sign = INCOME_LINES.includes(line) ? -1 : 1;
    const accounts = (byLine.get(line) ?? [])
      .map((g): StatementAccount => ({ gl: g.gl, description: g.description, amount: sign * movement(g.gl, from, to), comparative: sign * movement(g.gl, cFrom, cTo) }))
      .filter((a) => a.amount !== 0 || a.comparative !== 0);
    return { line, accounts, amount: accounts.reduce((s, a) => s + a.amount, 0), comparative: accounts.reduce((s, a) => s + a.comparative, 0) };
  };
  const lines = STATEMENT_LINES.profitAndLoss;
  const income = lines.filter((l) => INCOME_LINES.includes(l)).map(row);
  const expenses = lines.filter((l) => !INCOME_LINES.includes(l) && l !== "Tax expense").map(row);
  const tax = row("Tax expense");
  const sum = (rows: StatementRow[], k: "amount" | "comparative") => rows.reduce((s, r) => s + r[k], 0);
  const profitBeforeTax = sum(income, "amount") - sum(expenses, "amount");
  const profitBeforeTaxComparative = sum(income, "comparative") - sum(expenses, "comparative");
  return {
    from, to, comparativeFrom: cFrom, comparativeTo: cTo, income, expenses, tax,
    totalIncome: sum(income, "amount"), totalIncomeComparative: sum(income, "comparative"),
    totalExpenses: sum(expenses, "amount"), totalExpensesComparative: sum(expenses, "comparative"),
    profitBeforeTax, profitBeforeTaxComparative, profit: profitBeforeTax - tax.amount, profitComparative: profitBeforeTaxComparative - tax.comparative,
  };
}

// ---------------------------------------------------------------------------
// notes: statutory ageing
// ---------------------------------------------------------------------------
export interface AgeingNote {
  title: string;
  bands: AgeingRow[];
  /** the total of the open items in the bands */
  total: number;
  /** other amounts that make up the statement line (allowance, accruals) */
  adjustments: { label: string; amount: number }[];
  /** the statement line as the balance sheet shows it */
  statementLine: string;
  perBalanceSheet: number;
  /** the note's total and adjustments less the balance sheet: zero when the note agrees */
  difference: number;
}

function cwipAgeing(asOf: IsoDate): AgeingRow[] {
  const bands = LOCALISATION.disclosureAgeing.tradePayablesAndCwip;
  const rows = bands.map((b, i): AgeingRow => ({ id: String(i), label: b.label, count: 0, amount: 0 }));
  const gls = new Set(["120100", "120200"]);
  for (const l of WORLD.lines as LineItem[]) {
    if (!gls.has(l.gl) || !isOpenAt(l, asOf)) continue;
    const months = daysBetween(l.postingDate, asOf) / 30.4375;
    const i = bands.findIndex((b) => b.maxMonths === null || months < b.maxMonths);
    rows[i].count += 1;
    rows[i].amount += l.amount;
  }
  return rows;
}

export function ageingNotes(asOf: IsoDate): AgeingNote[] {
  const lineTotal = (line: string, sign: 1 | -1) => sign * WORLD.glAccounts.filter((g) => g.statementLine === line && g.category !== "pl").reduce((s, g) => s + closing(g.gl, asOf), 0);
  const note = (title: string, statementLine: string, bands: AgeingRow[], adjustments: { label: string; amount: number }[], perBalanceSheet: number): AgeingNote => {
    const total = bands.reduce((s, b) => s + b.amount, 0);
    return { title, bands, total, adjustments, statementLine, perBalanceSheet, difference: total + adjustments.reduce((s, a) => s + a.amount, 0) - perBalanceSheet };
  };
  const allowance = closing("149100", asOf);
  const grir = -WC_GLS.grir.reduce((s, g) => s + closing(g, asOf), 0);
  return [
    note("Trade receivables ageing", "Trade receivables", statutoryAgeing("receivables", asOf), [{ label: "Allowance for expected credit loss", amount: allowance }], lineTotal("Trade receivables", 1)),
    note("Trade payables ageing", "Trade payables", statutoryAgeing("payables", asOf), [{ label: "Goods received, not invoiced (GR/IR clearing)", amount: grir }], lineTotal("Trade payables", -1)),
    note("Capital work in progress ageing", "Capital work-in-progress", cwipAgeing(asOf), [], lineTotal("Capital work-in-progress", 1)),
  ];
}

// ---------------------------------------------------------------------------
// the account behind a line
// ---------------------------------------------------------------------------
export interface AccountView {
  gl: GlAccount;
  /** month ends with the closing balance */
  trend: { month: string; closing: number }[];
  /** postings in the range, newest first */
  postings: LineItem[];
  count: number;
}

export function accountView(gl: string, from: IsoDate, to: IsoDate, limit = 100): AccountView | undefined {
  const g = GL_BY_ID.get(gl);
  if (!g) return undefined;
  const lines = WORLD.lines.filter((l) => l.gl === gl && l.postingDate >= from && l.postingDate <= to);
  const months = monthsBetween(monthOf(from), monthOf(to));
  return {
    gl: g,
    trend: months.map((m) => ({ month: m, closing: (BALANCES.byGl.get(gl) ?? []).find((b) => monthOf(b.periodEnd) === m)?.closing ?? 0 })),
    postings: lines.sort((a, b) => b.postingDate.localeCompare(a.postingDate)).slice(0, limit),
    count: lines.length,
  };
}

/** The first and last month of the fiscal quarter a date is in, "2026-07" to "2026-09". */
export function fiscalQuarterMonths(date: IsoDate, fyStartMonth: number): { from: string; to: string } {
  const m = Number(date.slice(5, 7));
  const offset = (((m - fyStartMonth) % 12) + 12) % 12;
  const start = shiftMonth(monthOf(date), -(offset % 3));
  return { from: start, to: shiftMonth(start, 2) };
}

/** The first and last month of the fiscal year to a date, "2026-01" to "2026-09". */
export function fiscalYearMonths(date: IsoDate, fyStartMonth: number): { from: string; to: string } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const startYear = m >= fyStartMonth ? y : y - 1;
  return { from: `${startYear}-${String(fyStartMonth).padStart(2, "0")}`, to: monthOf(date) };
}
