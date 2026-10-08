import { describe, expect, it } from "vitest";
import { WORLD, BALANCES } from "@/data";
import { buildContext } from "@/engine/context";
import { BSR_EVALUATORS } from "@/engine/rules/bsr";
import { daysBetween } from "@/lib/dates";
import { LOCALISATION } from "@/config/localisation";
import { byBusinessUnit, customerBalances, msmeOverdue, payablesAgeing, receivablesAgeing, vendorBalances, wcPointAt, wcTrend, WORKING_CAPITAL_POLICY } from "@/engine/workingCapital";

const asOf = WORLD.asOf;
const periods = BALANCES.periods;
const i = periods.indexOf(asOf);
const sumGl = (pred: (g: (typeof WORLD.glAccounts)[number]) => boolean, from: string | null, sign = 1) =>
  sign * WORLD.lines.filter((l) => pred(WORLD.glAccounts.find((g) => g.gl === l.gl)!) && l.postingDate <= asOf && (from === null || l.postingDate > from)).reduce((s, l) => s + l.amount, 0);

describe("working capital measures", () => {
  const p = wcPointAt(asOf)!;
  const from = periods[i - WORKING_CAPITAL_POLICY.flowMonths];
  const span = daysBetween(from, asOf);

  it("computes receivable days from the lines, independently of the period table", () => {
    const receivables = sumGl((g) => (g.category === "trade-recv" && g.gl !== "149100") || g.category === "unbilled" || g.category === "retention", null);
    const revenue = sumGl((g) => g.statementLine === "Revenue from operations", from, -1);
    expect(p.receivables).toBeCloseTo(receivables, 0);
    expect(p.dso).toBeCloseTo(receivables / (revenue / span), 6);
    expect(p.dso).toBeGreaterThan(20);
    expect(p.dso).toBeLessThan(250);
  });

  it("computes inventory and payable days from the lines", () => {
    const inventory = sumGl((g) => g.category === "inventory", null);
    const payables = sumGl((g) => g.category === "trade-pay" || g.category === "grir", null, -1);
    const materials = sumGl((g) => g.statementLine === "Cost of materials consumed", from);
    const other = sumGl((g) => g.statementLine === "Other expenses", from);
    expect(p.dio).toBeCloseTo(inventory / (materials / span), 6);
    expect(p.dpo).toBeCloseTo(payables / ((materials + other) / span), 6);
  });

  it("is the cash conversion cycle by definition, and net working capital is the sum of its parts", () => {
    expect(p.ccc).toBeCloseTo(p.dso + p.dio - p.dpo, 9);
    expect(p.nwc).toBeCloseTo(p.receivables + p.inventory - p.payables - p.advances, 2);
  });

  it("gives a trend that ends at the period and has no gaps", () => {
    const t = wcTrend(asOf);
    expect(t.length).toBe(WORKING_CAPITAL_POLICY.trendMonths);
    expect(t[t.length - 1].periodEnd).toBe(asOf);
    expect(t[t.length - 1].dso).toBeCloseTo(p.dso, 9);
    for (let k = 1; k < t.length; k += 1) expect(t[k].periodEnd > t[k - 1].periodEnd).toBe(true);
  });

  it("has nothing to say before there is a flow to measure", () => {
    expect(wcPointAt(periods[0])).toBeUndefined();
  });
});

describe("working capital by business unit", () => {
  it("accounts for every open receivable and payable once", () => {
    const rows = byBusinessUnit(asOf);
    const p = wcPointAt(asOf)!;
    expect(rows.reduce((s, r) => s + r.receivables, 0)).toBeCloseTo(p.receivables, 0);
    expect(rows.reduce((s, r) => s + r.payables, 0)).toBeCloseTo(p.payables, 0);
    for (const r of rows) expect(r.overSixMonths).toBeLessThanOrEqual(r.receivables + 1e-6 + Math.abs(r.receivables));
  });

  it("splits the company flow across the units", () => {
    const rows = byBusinessUnit(asOf);
    const from = periods[i - WORKING_CAPITAL_POLICY.flowMonths];
    const revenue = sumGl((g) => g.statementLine === "Revenue from operations", from, -1) / daysBetween(from, asOf);
    expect(rows.reduce((s, r) => s + r.revenueDaily, 0)).toBeCloseTo(revenue, 4);
  });
});

describe("ageing and balances by party", () => {
  it("places every open trade receivable in one statutory band", () => {
    const bands = receivablesAgeing(asOf);
    expect(bands.map((b) => b.label)).toEqual(LOCALISATION.disclosureAgeing.tradeReceivables.map((b) => b.label));
    const trade = customerBalances(asOf).reduce((s, c) => s + c.balance, 0);
    const debits = bands.reduce((s, b) => s + b.amount, 0);
    expect(debits).toBeGreaterThanOrEqual(trade - 1);
    expect(bands.reduce((s, b) => s + b.count, 0)).toBeGreaterThan(0);
  });

  it("uses the payable bands for payables", () => {
    expect(payablesAgeing(asOf).map((b) => b.label)).toEqual(LOCALISATION.disclosureAgeing.tradePayablesAndCwip.map((b) => b.label));
  });

  it("lists parties largest first, and each customer balance is real open items", () => {
    const c = customerBalances(asOf);
    const v = vendorBalances(asOf);
    for (const list of [c, v]) {
      const abs = list.map((x) => Math.abs(x.balance));
      expect(abs).toEqual([...abs].sort((a, b) => b - a));
    }
    expect(c.length).toBeGreaterThan(10);
    expect(v.length).toBeGreaterThan(10);
  });

  it("finds the same overdue small-enterprise invoices as the rule that watches them", () => {
    const hits = BSR_EVALUATORS["BSR-18"](buildContext(asOf), { paymentDays: WORKING_CAPITAL_POLICY.msmeDays });
    const m = msmeOverdue(asOf);
    expect(m.count).toBe(hits.length);
    expect(m.vendors.reduce((s, x) => s + x.count, 0)).toBe(m.count);
    expect(m.value).toBeGreaterThan(0);
  });
});
