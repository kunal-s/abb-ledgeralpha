import { describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { buildContext } from "@/engine/context";
import { BSR_EVALUATORS } from "@/engine/rules/bsr";
import { GST_POLICY, bookInvoices, byPeriod, creditAtRisk, gstTdsCredits, reconcile, returnsTracker } from "@/engine/gst";

const asOf = WORLD.asOf;
const books = bookInvoices(asOf);
const matches = reconcile(asOf);

describe("matching the books to the statement", () => {
  it("classifies every supplier invoice of the year once, and every statement line once", () => {
    expect(books.length).toBeGreaterThan(1000);
    const inBooks = matches.filter((m) => m.book);
    expect(inBooks).toHaveLength(books.length);
    expect(new Set(inBooks.map((m) => m.book!.docKey)).size).toBe(books.length);
    const inStatement = matches.filter((m) => m.stmt);
    expect(inStatement).toHaveLength(WORLD.gstStatement.filter((s) => s.invoiceDate <= asOf).length);
    expect(new Set(inStatement.map((m) => m.stmt!.id)).size).toBe(inStatement.length);
  });

  it("calls a supply matched when the tax agrees to the rupee and different when it does not", () => {
    for (const m of matches) {
      if (m.cls === "matched") expect(Math.abs(m.booksTax - m.stmtTax)).toBeLessThanOrEqual(GST_POLICY.tolerance);
      if (m.cls === "different") expect(Math.abs(m.booksTax - m.stmtTax)).toBeGreaterThan(GST_POLICY.tolerance);
      if (m.cls === "missing-in-statement") expect(m.stmt).toBeUndefined();
      if (m.cls === "missing-in-books") expect(m.book).toBeUndefined();
    }
    const n = (c: string) => matches.filter((m) => m.cls === c).length;
    expect(n("matched")).toBeGreaterThan(books.length * 0.85);
    expect(n("different")).toBeGreaterThan(0);
    expect(n("missing-in-statement")).toBeGreaterThan(0);
    expect(n("missing-in-books")).toBeGreaterThan(0);
  });

  it("finds the three planted invoices in the books and not in the statement, for exactly 6,84,200 of credit", () => {
    const keys = new Set(WORLD.anchors["S-23"]);
    const planted = matches.filter((m) => m.book && keys.has(m.book.apKey));
    expect(planted).toHaveLength(3);
    for (const m of planted) expect(m.cls).toBe("missing-in-statement");
    expect(planted.reduce((s, m) => s + m.booksTax, 0)).toBe(6_84_200);
  });

  it("puts at stake the whole tax of an unreported supply and the difference of a different one", () => {
    for (const m of matches) {
      if (m.cls === "missing-in-statement") expect(m.atStake).toBe(m.booksTax);
      if (m.cls === "missing-in-books") expect(m.atStake).toBe(m.stmtTax);
      if (m.cls === "different") expect(m.atStake).toBeCloseTo(Math.abs(m.booksTax - m.stmtTax), 2);
      if (m.cls === "matched") expect(m.atStake).toBeLessThanOrEqual(GST_POLICY.tolerance);
    }
  });
});

describe("by return period", () => {
  const periods = byPeriod(matches);

  it("adds up to the matches, with credit available only for supplies in both", () => {
    expect(periods.reduce((s, p) => s + p.booksTax, 0)).toBeCloseTo(matches.reduce((s, m) => s + m.booksTax, 0), 2);
    expect(periods.reduce((s, p) => s + p.byClass.matched.count + p.byClass.different.count + p.byClass["missing-in-statement"].count + p.byClass["missing-in-books"].count, 0)).toBe(matches.length);
    for (const p of periods) expect(p.available).toBeLessThanOrEqual(Math.min(p.booksTax, p.stmtTax) + 1e-6 + p.booksTax);
  });

  it("tracks each return: filed on time, filed late, due or overdue", () => {
    const r = returnsTracker(asOf, periods);
    expect(r.map((x) => x.period)).toEqual(WORLD.gstReturns.map((x) => x.period));
    expect(r.find((x) => x.period === "2026-06")!.status).toBe("late");
    expect(r.find((x) => x.period === "2026-06")!.daysLate).toBe(2);
    expect(r.find((x) => x.period === "2026-09")!.status).toBe("due");
    expect(r.filter((x) => x.status === "on-time").length).toBeGreaterThan(3);
  });
});

describe("credit at risk and tax deducted by customers", () => {
  it("finds the same unpaid supplier invoices as the rule that watches them", () => {
    const hits = BSR_EVALUATORS["BSR-17"](buildContext(asOf), { ageDays: GST_POLICY.paymentDays });
    expect(creditAtRisk(asOf)).toHaveLength(hits.length);
    for (const r of creditAtRisk(asOf)) expect(r.days).toBeGreaterThan(GST_POLICY.paymentDays);
  });

  it("lists the tax deducted by customers, largest first, and its total is the account", () => {
    const c = gstTdsCredits(asOf);
    const abs = c.map((x) => Math.abs(x.balance));
    expect(abs).toEqual([...abs].sort((a, b) => b - a));
    const total = WORLD.lines.filter((l) => l.gl === "162400" && !l.clearing).reduce((s, l) => s + l.amount, 0);
    expect(c.reduce((s, x) => s + x.balance, 0)).toBeCloseTo(total, 2);
  });
});
