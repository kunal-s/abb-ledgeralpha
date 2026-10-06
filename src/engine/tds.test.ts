import { describe, expect, it } from "vitest";
import type { LineItem, Party, TaxCreditStatementLine } from "@/types";
import { LINE_BY_KEY, PARTY_BY_ID, WORLD } from "@/data";
import { SEEDED_RULE_OVERRIDES } from "@/data/workspace/activity";
import { effectiveRules, runRules } from "@/engine/run";
import { analyseTds } from "@/engine/tdsAnalysis";
import { allocateTdsCredits, checkExpectedCredit, creditAgeBucket, taxQuarterEnd, taxQuarterOf, tdsPayable } from "@/engine/tds";
import { computeMatches } from "@/state/cashAppModel";

const AS_OF = WORLD.asOf;
const P = { statementLagDays: 75, toleranceAmount: 10 };
const anchor = (id: string, i = 0) => WORLD.anchors[id][i];

// ---------------------------------------------------------------------------
// Synthetic deductions and statement lines
// ---------------------------------------------------------------------------
const customer = { id: "C1", type: "Customer", name: "Customer", deductorIdMasked: "MUMA12345E" } as Party;
const parties = new Map([["C1", customer]]);
const line = (key: string, date: string, amount: number) => ({ key, gl: "161100", amount, postingDate: date, partner: { type: "Customer", id: "C1" } }) as LineItem;
const credit = (id: string, quarter: string, taxCredited: number, tan = "MUMA12345E"): TaxCreditStatementLine => ({
  id, deductorTaxIdMasked: tan, customerId: "C1", taxYearQuarter: quarter, transactionDate: "2026-01-15", natureOfPayment: "Contract work", amountPaid: taxCredited * 50, taxCredited,
});

describe("tax credit allocation", () => {
  it("quarters follow the statutory tax year, April to March", () => {
    expect(taxQuarterOf("2026-03-03")).toBe("Q4 FY2025-26");
    expect(taxQuarterOf("2026-04-01")).toBe("Q1 FY2026-27");
    expect(taxQuarterEnd("2026-03-03")).toBe("2026-03-31");
    expect(taxQuarterEnd("2026-08-20")).toBe("2026-09-30");
  });

  it("classifies each deduction against the statement, and reports what the statement carries alone", () => {
    const lines = [
      line("matched", "2026-01-10", 50_000),
      line("short", "2026-01-12", 80_000),
      line("elsewhere", "2026-01-14", 30_000),
      line("missing", "2026-01-16", 12_345),
      line("tan", "2026-02-10", 40_000),
      line("pending", "2026-08-20", 70_000), // the statement for Jul-Sep is not out until mid December
    ];
    const credits = new Map([
      ["C1", [
        credit("S1", "Q4 FY2025-26", 50_005),
        credit("S2", "Q4 FY2025-26", 48_000),
        credit("S3", "Q3 FY2025-26", 30_000), // credited in the quarter before
        credit("S4", "Q4 FY2025-26", 40_000, "MUMA99999E"),
        credit("S5", "Q4 FY2025-26", 130_000), // nothing in the books explains it
      ]],
    ]);
    const { byLine, unbooked } = allocateTdsCredits(lines, credits, parties, AS_OF, P);
    const st = (k: string) => byLine.get(k)!.status;
    expect([st("matched"), st("short"), st("elsewhere"), st("missing"), st("tan"), st("pending")]).toEqual(["matched", "short", "wrong-quarter", "missing", "wrong-tan", "pending"]);
    expect(byLine.get("short")!.credited).toBe(48_000);
    expect(byLine.get("elsewhere")!.statementQuarter).toBe("Q3 FY2025-26");
    expect(unbooked.map((c) => c.id)).toEqual(["S5"]);
  });

  it("allocates one statement line to one deduction only", () => {
    const lines = [line("a", "2026-01-10", 50_000), line("b", "2026-01-11", 50_000)];
    const { byLine } = allocateTdsCredits(lines, new Map([["C1", [credit("S1", "Q4 FY2025-26", 50_000)]]]), parties, AS_OF, P);
    expect([byLine.get("a")!.status, byLine.get("b")!.status]).toEqual(["matched", "missing"]);
  });

  it("checks a deduction that is not yet booked against the statement lines nobody has used", () => {
    const open = [credit("S1", "Q4 FY2025-26", 40_710)];
    expect(checkExpectedCredit("C1", "2026-03-03", 40_710, open, parties, AS_OF, P).status).toBe("matched");
    expect(checkExpectedCredit("C1", "2026-03-03", 30_000, open, parties, AS_OF, P).status).toBe("missing");
    expect(checkExpectedCredit("C1", "2026-03-03", 99_999, open, parties, AS_OF, P).status).toBe("short");
    expect(checkExpectedCredit("C1", "2026-09-01", 40_710, open, parties, AS_OF, P).status).toBe("pending");
  });

  it("ages credits at risk into the buckets", () => {
    expect([0, 180, 181, 365, 366, 730, 731].map((d) => creditAgeBucket(new Date(Date.parse(AS_OF) - d * 86_400_000).toISOString().slice(0, 10), AS_OF))).toEqual(["0-180", "0-180", "181-365", "181-365", "1-2y", "1-2y", "2y+"]);
  });
});

describe("tax credits in the world", () => {
  const analysis = analyseTds(AS_OF, P);

  it("every open deduction has a status, and the statuses cover each kind of exception", () => {
    expect(analysis.open.length).toBeGreaterThan(500);
    const statuses = new Set<string>();
    for (const l of analysis.open) {
      const a = analysis.byLine.get(l.key);
      expect(a, l.docNo).toBeDefined();
      statuses.add(a!.status);
    }
    for (const s of ["matched", "short", "missing", "wrong-quarter", "wrong-tan", "pending"]) expect(statuses.has(s), s).toBe(true);
  });

  it("agrees with the rule that flags missing credits: the same deductions, with the same reasons", () => {
    const run = runRules(AS_OF, effectiveRules(SEEDED_RULE_OVERRIDES));
    const flagged = new Map(run.hits.filter((h) => h.ruleId === "BSR-07").map((h) => [h.itemKey, h.facts.creditStatus]));
    const expected = new Map<string, string>();
    for (const l of analysis.open) {
      const s = analysis.byLine.get(l.key)!.status;
      if (s === "short") expected.set(l.key, "short credit");
      else if (s === "wrong-quarter") expected.set(l.key, "credited in another quarter");
      else if (s === "missing") expected.set(l.key, "missing");
    }
    expect(flagged.size).toBeGreaterThan(20);
    expect(flagged).toEqual(expected);
  });

  it("S-06 and S-07 are missing from the statement", () => {
    expect(analysis.byLine.get(anchor("S-06"))!.status).toBe("missing");
    expect(analysis.byLine.get(anchor("S-07"))!.status).toBe("missing");
  });

  it("statement lines no deduction explains are reported, and none is also matched", () => {
    expect(analysis.unbooked.length).toBeGreaterThan(5);
    const used = new Set([...analysis.byLine.values()].map((a) => a.statementId).filter(Boolean));
    for (const c of analysis.unbooked) expect(used.has(c.id)).toBe(false);
  });

  it("the tax S-11's customer will deduct is expected as a credit and is not in the statement", () => {
    const m = computeMatches({}, {}).get(anchor("S-11"))!;
    const tds = m.proposals[0].deductions.find((d) => d.kind === "tds")!;
    expect(tds.amount).toBe(40_710);
    const check = checkExpectedCredit(m.proposals[0].customerId, m.receipt.date, tds.amount, analysis.unbooked, PARTY_BY_ID, AS_OF, P);
    expect(check).toMatchObject({ status: "missing", quarter: "Q4 FY2025-26" });
    expect(LINE_BY_KEY.get(anchor("S-11"))!.postingDate).toBe("2026-03-03");
  });
});

describe("tax deducted by the company", () => {
  const rows = tdsPayable(WORLD.lines.filter((l) => ["241100", "241200", "241300"].includes(l.gl)), AS_OF);

  it("S-16: the professional-fee deduction of February was never deposited", () => {
    const feb = rows.find((r) => r.gl === "241200" && r.month === "2026-02")!;
    expect([feb.deducted, feb.deposited, feb.outstanding, feb.status]).toEqual([1_84_300, 0, 1_84_300, "overdue"]);
    expect(feb.due).toBe("2026-03-07");
    expect(feb.daysLate).toBeGreaterThan(200);
  });

  it("salary deductions are deposited by the 7th of the next month, and September's is not yet due", () => {
    const salary = rows.filter((r) => r.gl === "241300");
    expect(salary.length).toBeGreaterThan(12);
    const sep = salary.find((r) => r.month === "2026-09")!;
    expect([sep.status, sep.due, sep.outstanding > 0]).toEqual(["due", "2026-10-07", true]);
    for (const r of salary.filter((x) => x.month < "2026-09")) expect([r.month, r.status]).toEqual([r.month, "deposited"]);
  });

  it("deducted equals deposited plus outstanding", () => {
    for (const r of rows) expect(r.deducted).toBe(r.deposited + r.outstanding);
  });
});
