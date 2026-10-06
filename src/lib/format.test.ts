import { describe, expect, it } from "vitest";
import { fmtDrCr, fmtINR, fmtINRCompact, fmtInt, fmtPct } from "@/lib/format";
import {
  daysBetween,
  fiscalQuarterLabel,
  fiscalYearLabel,
  fmtDate,
  fmtMonth,
  parseIsoDate,
} from "@/lib/dates";

describe("INR formatting", () => {
  it("groups digits the Indian way", () => {
    expect(fmtInt(12345678)).toBe("1,23,45,678");
    expect(fmtINR(24000000)).toBe("₹2,40,00,000");
    expect(fmtINR(-12450)).toBe("-₹12,450");
  });

  it("compacts to lakh and crore", () => {
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

  it("formats dates and months", () => {
    expect(fmtDate("2026-09-30")).toBe("30-Sep-2026");
    expect(fmtDate("2026-01-05")).toBe("05-Jan-2026");
    expect(fmtMonth("2026-09-30")).toBe("Sep 2026");
  });

  it("labels a calendar-year fiscal year", () => {
    expect(fiscalYearLabel("2026-09-30", 1, "CY")).toBe("CY2026");
    expect(fiscalQuarterLabel("2026-09-30", 1, "CY")).toBe("Q3 CY2026");
    expect(fiscalQuarterLabel("2026-01-01", 1, "CY")).toBe("Q1 CY2026");
  });

  it("labels an April–March year (Indian tax year)", () => {
    expect(fiscalYearLabel("2026-09-30", 4, "FY")).toBe("FY2026-27");
    expect(fiscalQuarterLabel("2026-09-30", 4, "FY")).toBe("Q2 FY2026-27");
    expect(fiscalQuarterLabel("2026-04-01", 4, "FY")).toBe("Q1 FY2026-27");
    expect(fiscalQuarterLabel("2026-03-31", 4, "FY")).toBe("Q4 FY2025-26");
    expect(fiscalQuarterLabel("2026-12-15", 4, "FY")).toBe("Q3 FY2026-27");
  });
});
