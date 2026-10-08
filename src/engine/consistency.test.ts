// The same population must give the same number on every screen: the working
// capital drill, its overview, the balance sheet review, the statements and
// management reporting read one ledger, and their figures agree.

import { beforeEach, describe, expect, it } from "vitest";
import { BALANCES, WORLD, balanceAt } from "@/data";
import { ageingNotes, balanceSheet, profitAndLoss } from "@/engine/financials";
import { resultsTable } from "@/engine/management";
import { plRange, scopePcs } from "@/engine/pl";
import { WC_GLS, drill, openOf, reviewAgeing, statutoryAgeing, wcMetrics, type Side } from "@/engine/workingCapital";
import { modelsAt } from "@/test/models";
import { useWorkflow } from "@/state/workflow";

const MONTH = WORLD.asOf.slice(0, 7);
const BUS = WORLD.businessUnits.map((b) => b.id).filter((id) => id !== "CORP");

describe("one population, one number", () => {
  beforeEach(() => {
    useWorkflow.getState().resetDemo();
  });

  it("the business unit table of the overview is the first level of the receivables and payables drill", () => {
    for (const bu of BUS) {
      const m = wcMetrics(MONTH, bu).balances;
      const rec = drill("receivables", {}).rows.find((r) => r.key === bu);
      const pay = drill("payables", {}).rows.find((r) => r.key === bu);
      expect(rec!.amount, `${bu} receivables`).toBeCloseTo(m.receivables + m.retention, 0);
      expect(pay!.amount, `${bu} payables`).toBeCloseTo(m.payables, 0);
    }
    const all = wcMetrics(MONTH, "all").balances;
    expect(drill("receivables", {}).total.amount).toBeCloseTo(all.receivables + all.retention, 0);
    expect(drill("payables", {}).total.amount).toBeCloseTo(all.payables, 0);
  });

  it("the drill, the ageing of the drill and the statutory ageing count the same items and add to the same total", () => {
    for (const side of ["receivables", "payables"] as Side[]) {
      const d = drill(side, {});
      const items = openOf(side);
      expect(d.total.count).toBe(items.length);
      expect(d.rows.reduce((s, r) => s + r.count, 0)).toBe(items.length);
      for (const rows of [reviewAgeing(side), statutoryAgeing(side)]) {
        expect(rows.reduce((s, r) => s + r.count, 0)).toBe(items.length);
        expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(d.total.amount, 2);
      }
      // the ageing bar of each row is its bands, which add to the amount
      for (const r of d.rows) expect(Object.values(r.bands).reduce((s, v) => s + v, 0), `${side} ${r.key}`).toBeCloseTo(r.amount, 2);
    }
  });

  it("the open items of each account are the open items the balance sheet review counts, and add to its balance", () => {
    const review = modelsAt().review;
    const sets: [Side, readonly string[], 1 | -1][] = [
      ["receivables", [...WC_GLS.receivables, ...WC_GLS.retention], 1],
      ["payables", WC_GLS.payables, -1],
    ];
    for (const [side, gls, sign] of sets) {
      for (const gl of gls) {
        const mine = openOf(side).filter((l) => l.gl === gl);
        const theirs = review.scan.accounts.get(gl);
        expect(theirs, gl).toBeDefined();
        expect(mine.length, `${gl} items`).toBe(theirs!.openCount);
        expect(sign * mine.reduce((s, l) => s + l.amount, 0), `${gl} balance`).toBeCloseTo(sign * theirs!.closing, 0);
        expect(sign * theirs!.closing, `${gl} ledger`).toBeCloseTo(sign * (balanceAt(BALANCES, gl, WORLD.asOf)?.closing ?? 0), 0);
      }
    }
  });

  it("the receivables and payables of the statements are the open items of the working capital screens, less the allowance and plus GR/IR", () => {
    const notes = ageingNotes(WORLD.asOf);
    const rec = notes.find((n) => n.statementLine === "Trade receivables")!;
    const pay = notes.find((n) => n.statementLine === "Trade payables")!;
    expect(rec.total).toBeCloseTo(drill("receivables", {}).total.amount, 2);
    expect(pay.total).toBeCloseTo(drill("payables", {}).total.amount, 2);
    const bs = balanceSheet(WORLD.asOf, "2026-06-30");
    expect(bs.assets.find((r) => r.line === "Trade receivables")!.amount).toBeCloseTo(rec.total + rec.adjustments[0].amount, 0);
    const all = wcMetrics(MONTH, "all").balances;
    expect(bs.liabilities.find((r) => r.line === "Trade payables")!.amount).toBeCloseTo(all.payables + all.grir, 0);
  });

  it("revenue is the same in management reporting, the statements and the days of sales", () => {
    const company = resultsTable(MONTH)[0];
    expect(company.ytd.revenue).toBeCloseTo(profitAndLoss("2026-01", MONTH).income[0].amount, 0);
    const m = wcMetrics(MONTH, "all");
    expect(m.revenue).toBeCloseTo(plRange("2026-07", "2026-09", scopePcs({ kind: "company" })).revenue, 0);
  });
});
