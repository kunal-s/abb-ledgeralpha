import { describe, expect, it } from "vitest";
import { fmtDrCr, fmtINR, fmtINRCompact, fmtInt, fmtPct } from "@/lib/format";
import {
  abbQuarterLabel,
  daysBetween,
  fmtDate,
  indianFyQuarterLabel,
  parseIsoDate,
} from "@/lib/dates";

describe("INR formatting", () => {
  it("groups digits the Indian way", () => {
    expect(fmtInt(12345678)).toBe("1,23,45,678");
    expect(fmtINR(24000000)).toBe("₹2,40,00,000");
    expect(fmtINR(-12450)).toBe("-₹12,450");
  });

  it("compacts to lakh and crore (debrief worked example)", () => {
    expect(fmtINRCompact(12450)).toBe("₹12,450");
    expect(fmtINRCompact(4350000)).toBe("₹43.5 lakh");
    expect(fmtINRCompact(19650000)).toBe("₹1.97 cr");
    expect(fmtINRCompact(35000000)).toBe("₹3.50 cr");
    expect(fmtINRCompact(132030000000)).toBe("₹13,203 cr");
    expect(fmtINRCompact(-2360000)).toBe("-₹23.6 lakh");
  });

  it("expresses sign as Dr / Cr", () => {
    expect(fmtDrCr(1180000)).toBe("₹11,80,000 Dr");
    expect(fmtDrCr(-1180000)).toBe("₹11,80,000 Cr");
    expect(fmtDrCr(-1180000, true)).toBe("₹11.8 lakh Cr");
  });

  it("formats percentages to one decimal", () => {
    expect(fmtPct(0.734)).toBe("73.4%");
  });
});

describe("dates", () => {
  it("parses ISO dates without timezone drift", () => {
    const d = parseIsoDate("2026-09-30");
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 8, 30]);
    expect(() => parseIsoDate("30/09/2026")).toThrow();
  });

  it("counts days for ageing", () => {
    expect(daysBetween("2026-04-03", "2026-09-30")).toBe(180);
    expect(daysBetween("2025-09-30", "2026-09-30")).toBe(365);
    expect(daysBetween("2026-09-30", "2026-09-30")).toBe(0);
  });

  it("formats DD-MMM-YYYY", () => {
    expect(fmtDate("2026-09-30")).toBe("30-Sep-2026");
    expect(fmtDate("2026-01-05")).toBe("05-Jan-2026");
  });

  it("labels ABB calendar-year quarters", () => {
    expect(abbQuarterLabel("2026-09-30")).toBe("Q3 CY2026");
    expect(abbQuarterLabel("2026-01-01")).toBe("Q1 CY2026");
  });

  it("labels Indian income-tax FY quarters for TDS / 26AS", () => {
    expect(indianFyQuarterLabel("2026-09-30")).toBe("FY2026-27 Q2");
    expect(indianFyQuarterLabel("2026-04-01")).toBe("FY2026-27 Q1");
    expect(indianFyQuarterLabel("2026-03-31")).toBe("FY2025-26 Q4");
    expect(indianFyQuarterLabel("2026-12-15")).toBe("FY2026-27 Q3");
  });
});
