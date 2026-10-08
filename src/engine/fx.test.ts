import { describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { FX_MONETARY_GLS } from "@/data/generator/reference";
import { FX_BUCKETS, bucketOfDays, closingRate, coverage, exposureByCurrency, forwardMtm, fxItems, realisedInLedger, totals } from "@/engine/fx";
import { isOpenAt } from "@/data";

const asOf = WORLD.asOf;
const items = fxItems(asOf);
const rows = exposureByCurrency(asOf);

describe("foreign-currency items", () => {
  it("are the open monetary lines in a foreign currency, each once", () => {
    const expected = WORLD.lines.filter((l) => l.docCurrency !== "INR" && FX_MONETARY_GLS.has(l.gl) && isOpenAt(l, asOf));
    expect(items).toHaveLength(expected.length);
    expect(new Set(items.map((i) => i.line.key)).size).toBe(items.length);
    expect(items.length).toBeGreaterThan(300);
  });

  it("carry the amount in the currency and at the closing rate", () => {
    for (const i of items) {
      expect(i.revalued).toBeCloseTo(i.fx * closingRate(i.currency, asOf), 6);
      expect(i.side === "receivable").toBe(i.line.amountDoc > 0);
    }
  });

  it("make a loss of a liability that costs more at the closing rate, and a gain of an asset that is worth more", () => {
    for (const i of items) {
      const worth = i.revalued - i.booked;
      expect(i.unrealised).toBeCloseTo(i.side === "receivable" ? worth : -worth, 6);
    }
  });

  it("find the planted EUR payable booked at 96.00 and now at 97.50: a loss of 7,50,000", () => {
    const key = WORLD.anchors["S-21"][0];
    const i = items.find((x) => x.line.key === key)!;
    expect(i.currency).toBe("EUR");
    expect(i.side).toBe("payable");
    expect(i.fx).toBe(5_00_000);
    expect(closingRate("EUR", asOf)).toBe(97.5);
    expect(i.unrealised).toBeCloseTo(-7_50_000, 2);
    expect(i.bucket).toBe("0-30");
  });

  it("are placed in a bucket by the days to their due date", () => {
    expect(bucketOfDays(-1)).toBe("overdue");
    expect(bucketOfDays(0)).toBe("0-30");
    expect(bucketOfDays(30)).toBe("0-30");
    expect(bucketOfDays(31)).toBe("31-60");
    expect(bucketOfDays(90)).toBe("61-90");
    expect(bucketOfDays(91)).toBe("91+");
    for (const i of items) expect(FX_BUCKETS.map((b) => b.id)).toContain(i.bucket);
  });
});

describe("exposure by currency", () => {
  it("nets receivables against payables to the signed amounts of the lines", () => {
    for (const r of rows) {
      const lines = WORLD.lines.filter((l) => l.docCurrency === r.currency && FX_MONETARY_GLS.has(l.gl) && isOpenAt(l, asOf));
      const signed = lines.reduce((s, l) => s + l.amountDoc, 0);
      expect(Object.values(r.net).reduce((s, v) => s + v, 0)).toBeCloseTo(signed, 2);
      expect(r.receivables - r.payables).toBeCloseTo(signed, 2);
    }
  });

  it("splits the total unrealised result between receivables and payables without loss", () => {
    const t = totals(items, rows);
    expect(t.unrealised).toBeCloseTo(t.unrealisedReceivables + t.unrealisedPayables, 4);
    expect(rows.reduce((s, r) => s + r.unrealised, 0)).toBeCloseTo(t.unrealised, 4);
    expect(t.netInr).toBeCloseTo(t.receivablesInr - t.payablesInr, 4);
  });

  it("values a forward at the closing rate, the planted purchase at +5,50,000", () => {
    const f = WORLD.forwards.find((x) => x.currency === "EUR" && x.rate === 96.4 && x.amountFx === 5_00_000)!;
    expect(f.direction).toBe("Buy");
    expect(f.maturity).toBe("2026-10-30");
    expect(forwardMtm(f, 97.5)).toBeCloseTo(5_50_000, 2);
    expect(forwardMtm({ ...f, direction: "Sell" }, 97.5)).toBeCloseTo(-5_50_000, 2);
  });

  it("covers only in the direction opposed to the exposure, and never reports more than the exposure", () => {
    expect(coverage(100, -50)).toBe(0);
    expect(coverage(100, 50)).toBe(0.5);
    expect(coverage(-100, -80)).toBeCloseTo(0.8, 9);
    expect(coverage(100, 500)).toBe(1);
    expect(coverage(0, 10)).toBeNull();
  });

  it("has forwards that point against the exposure they were bought for", () => {
    for (const r of rows) {
      for (const b of ["0-30", "31-60", "61-90"] as const) {
        if (Math.abs(r.hedged[b]) > 0 && Math.abs(r.net[b]) > 1000) expect(Math.sign(r.hedged[b])).toBe(Math.sign(r.net[b]));
      }
    }
    expect(WORLD.forwards.length).toBeGreaterThan(3);
  });

  it("finds no exchange difference booked in the ledger this year", () => {
    expect(realisedInLedger(asOf)).toBe(0);
  });
});
