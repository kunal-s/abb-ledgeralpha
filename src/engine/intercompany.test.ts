import { describe, expect, it } from "vitest";
import { BALANCES, WORLD } from "@/data";
import { effectiveRec } from "@/engine/recs";
import { GROUP_BALANCE_GLS, NATURES, icBalances, relatedPartyTransactions } from "@/engine/intercompany";
import { fiscalYearStartDate } from "@/lib/dates";

const asOf = WORLD.asOf;

describe("balances with group companies", () => {
  const rows = icBalances(asOf);

  it("add up to the group accounts of the trial balance", () => {
    const closing = (gl: string) => BALANCES.byGl.get(gl)![BALANCES.periods.indexOf(asOf)].closing;
    const total = GROUP_BALANCE_GLS.reduce((s, gl) => s + closing(gl), 0);
    expect(rows.reduce((s, r) => s + r.net, 0)).toBeCloseTo(total, 0);
  });

  it("keep what is owed to the company apart from what it owes, and net them", () => {
    for (const r of rows) {
      expect(r.receivable).toBeGreaterThanOrEqual(0);
      expect(r.payable).toBeGreaterThanOrEqual(0);
      expect(r.net).toBeCloseTo(r.receivable - r.payable, 2);
    }
    expect(rows.length).toBe(WORLD.parties.filter((p) => p.type === "Group company").length);
  });

  it("have a confirmation reconciliation for every counterparty", () => {
    const recs = WORLD.reconciliations.filter((r) => r.type === "Intercompany");
    for (const r of rows) {
      const rec = recs.find((x) => x.partyId === r.partnerId);
      expect(rec, r.name).toBeDefined();
      const v = effectiveRec(rec!, undefined, asOf);
      expect(v.items.length).toBeGreaterThan(0);
    }
  });
});

describe("related-party transactions", () => {
  const { rows, totals } = relatedPartyTransactions(asOf);
  const from = fiscalYearStartDate(asOf, 1);

  it("take every group document of the year once, and the nature from its profit and loss line", () => {
    const docs = new Set(WORLD.lines.filter((l) => l.partner?.type === "Group company" && l.postingDate >= from && l.postingDate <= asOf).map((l) => `${l.fiscalYear}-${l.docNo}`));
    expect(rows.reduce((s, r) => s + r.documents, 0)).toBe(docs.size);
    for (const r of rows) expect(r.income + r.expense).toBeCloseTo(Object.values(r.byNature).reduce((s, v) => s + v, 0), 2);
  });

  it("assign each profit and loss account to one nature, income apart from expense", () => {
    const ids = NATURES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const k of Object.keys(totals)) expect(ids).toContain(k);
    expect(Object.values(totals).reduce((s, v) => s + v, 0)).toBeCloseTo(rows.reduce((s, r) => s + r.income + r.expense, 0), 2);
  });

  it("agree to the ledger: royalty is the royalty account, purchases the materials posted to group companies", () => {
    const royalty = WORLD.lines.filter((l) => l.gl === "530800" && l.postingDate >= from && l.postingDate <= asOf && WORLD.lines.some((x) => x.docNo === l.docNo && x.fiscalYear === l.fiscalYear && x.partner?.type === "Group company")).reduce((s, l) => s + l.amount, 0);
    expect(totals.royalty ?? 0).toBeCloseTo(royalty, 2);
  });

  it("list the busiest counterparty first", () => {
    const v = rows.map((r) => r.income + r.expense);
    expect(v).toEqual([...v].sort((a, b) => b - a));
  });
});
