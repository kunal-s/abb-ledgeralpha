import { describe, expect, it } from "vitest";
import { BALANCES, PARTY_BY_ID, WORLD, balanceAt } from "@/data";
import { WORKING_CAPITAL_POLICY as P } from "@/config/policies";
import { buOfProfitCentre } from "@/engine/attribution";
import { WC_GLS, balanceOf, drill, msmeOverdue, openOf, reliableFrom, reviewAgeing, statutoryAgeing, wcMetrics, wcTrend, type Side } from "@/engine/workingCapital";

const MONTH = WORLD.asOf.slice(0, 7);
const closing = (gls: readonly string[], date: string) => gls.reduce((s, g) => s + (balanceAt(BALANCES, g, date)?.closing ?? 0), 0);
const BUS = WORLD.businessUnits.map((b) => b.id);

describe("working capital measures (FR-WCP-01)", () => {
  it("month-end balances by business unit add up to the trial balance", () => {
    for (const date of ["2026-06-30", "2026-09-30"]) {
      const b = wcMetrics(date.slice(0, 7), "all").balances;
      expect(b.receivables).toBeCloseTo(closing(WC_GLS.receivables, date), 0);
      expect(b.unbilled).toBeCloseTo(closing(WC_GLS.unbilled, date), 0);
      expect(b.retention).toBeCloseTo(closing(WC_GLS.retention, date), 0);
      expect(b.inventory).toBeCloseTo(closing(WC_GLS.inventory, date), 0);
      expect(b.payables).toBeCloseTo(-closing(WC_GLS.payables, date), 0);
      expect(b.grir).toBeCloseTo(-closing(WC_GLS.grir, date), 0);
      expect(b.advances).toBeCloseTo(-closing(WC_GLS.advances, date), 0);
    }
  });

  it("the company's balances are the sum of its business units", () => {
    const all = wcMetrics(MONTH, "all");
    for (const k of Object.keys(all.balances) as (keyof typeof all.balances)[]) {
      expect(BUS.reduce((s, u) => s + wcMetrics(MONTH, u).balances[k], 0), k).toBeCloseTo(all.balances[k], 0);
    }
  });

  it("reads the measures from the balances and the trailing three months", () => {
    const m = wcMetrics(MONTH, "all");
    const receivable = m.balances.receivables + m.balances.unbilled + m.balances.retention;
    expect(m.days).toBe(92);
    expect(m.dso).toBeCloseTo((receivable / m.revenue) * m.days, 6);
    expect(m.dsoFunded).toBeCloseTo(((receivable - m.balances.advances) / m.revenue) * m.days, 6);
    expect(m.dpo).toBeCloseTo(((m.balances.payables + m.balances.grir) / m.purchases) * m.days, 6);
    expect(m.dio).toBeCloseTo((m.balances.inventory / m.material) * m.days, 6);
    expect(m.cycle).toBeCloseTo(m.dsoFunded + m.dio! - m.dpo, 6);
    expect(m.netWorkingCapital).toBeCloseTo(receivable + m.balances.inventory - m.balances.payables - m.balances.grir - m.balances.advances, 0);
    expect(m.dsoFunded).toBeLessThanOrEqual(m.dso);
    for (const v of [m.dso, m.dpo, m.dio!]) {
      expect(v).toBeGreaterThan(10);
      expect(v).toBeLessThan(250);
    }
  });

  it("days of inventory are only the company's, because inventory is held at corporate", () => {
    for (const u of BUS) {
      const m = wcMetrics(MONTH, u);
      expect(m.dio, u).toBeUndefined();
      expect(m.cycle, u).toBeUndefined();
    }
  });

  it("the trend starts at the first month the balances are complete, however many months are asked for", () => {
    expect(reliableFrom()).toBe("2026-06");
    const t = wcTrend("all");
    expect(t.map((x) => x.month)).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
    expect(wcTrend("all", MONTH, 24).map((x) => x.month)[0]).toBe("2026-06");
    expect(wcTrend("all", MONTH, 2).map((x) => x.month)).toEqual(["2026-08", "2026-09"]);
    expect(P.trendMonths).toBeGreaterThanOrEqual(t.length);
    expect(t.at(-1)).toEqual(wcMetrics(MONTH, "all"));
  });
});

describe("receivables and payables ageing", () => {
  for (const side of ["receivables", "payables"] as Side[]) {
    it(`${side}: the review ageing, the statutory ageing and the open items give one total`, () => {
      const items = openOf(side);
      const total = items.reduce((s, l) => s + balanceOf(side, l), 0);
      const review = reviewAgeing(side);
      const statutory = statutoryAgeing(side);
      expect(review.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(total, 2);
      expect(statutory.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(total, 2);
      expect(review.reduce((s, r) => s + r.count, 0)).toBe(items.length);
      expect(statutory.reduce((s, r) => s + r.count, 0)).toBe(items.length);
      expect(drill(side, {}).total.amount).toBeCloseTo(total, 2);
    });
  }

  it("the open items are the ledger's open items, to the penny of the control accounts less retention and unbilled", () => {
    const rec = openOf("receivables").reduce((s, l) => s + l.amount, 0);
    expect(rec).toBeCloseTo(closing([...WC_GLS.receivables, ...WC_GLS.retention], WORLD.asOf), 0);
    const pay = openOf("payables").reduce((s, l) => s - l.amount, 0);
    expect(pay).toBeCloseTo(-closing(WC_GLS.payables, WORLD.asOf), 0);
  });
});

describe("drill (FR-WCP-02)", () => {
  it("every level adds up to the level above it, down to the document", () => {
    const top = drill("receivables", {});
    expect(top.level).toBe("bu");
    expect(top.rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(top.total.amount, 2);
    expect(top.rows.reduce((s, r) => s + r.count, 0)).toBe(top.total.count);
    for (let i = 1; i < top.rows.length; i += 1) expect(top.rows[i - 1].amount).toBeGreaterThanOrEqual(top.rows[i].amount);

    const bu = top.rows[0];
    const pcs = drill("receivables", { bu: bu.key });
    expect(pcs.level).toBe("pc");
    expect(pcs.total.amount).toBeCloseTo(bu.amount, 2);
    expect(pcs.rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(bu.amount, 2);

    const pc = pcs.rows[0];
    const projects = drill("receivables", { bu: bu.key, pc: pc.key });
    expect(projects.level).toBe("project");
    expect(projects.total.amount).toBeCloseTo(pc.amount, 2);

    const project = projects.rows[0];
    const parties = drill("receivables", { bu: bu.key, pc: pc.key, project: project.key });
    expect(parties.level).toBe("party");
    expect(parties.total.amount).toBeCloseTo(project.amount, 2);

    const party = parties.rows[0];
    const docs = drill("receivables", { bu: bu.key, pc: pc.key, project: project.key, party: party.key });
    expect(docs.level).toBe("document");
    expect(docs.items.length).toBe(party.count);
    expect(docs.items.reduce((s, l) => s + balanceOf("receivables", l), 0)).toBeCloseTo(party.amount, 2);
    for (const l of docs.items) expect(buOfProfitCentre(l.profitCentre)).toBe(bu.key);
  });

  it("payables skip the project level: business unit, profit centre, supplier, document", () => {
    const top = drill("payables", {});
    const bu = top.rows[0];
    const pcs = drill("payables", { bu: bu.key });
    const suppliers = drill("payables", { bu: bu.key, pc: pcs.rows[0].key });
    expect(suppliers.level).toBe("party");
    const docs = drill("payables", { bu: bu.key, pc: pcs.rows[0].key, party: suppliers.rows[0].key });
    expect(docs.level).toBe("document");
    expect(docs.items.reduce((s, l) => s + balanceOf("payables", l), 0)).toBeCloseTo(suppliers.rows[0].amount, 2);
  });

  it("the part older than the review threshold never exceeds the amount", () => {
    for (const side of ["receivables", "payables"] as Side[]) {
      for (const r of drill(side, {}).rows) {
        expect(r.aged).toBeLessThanOrEqual(r.amount + 0.01);
        expect(r.oldest).toBeGreaterThan(0);
      }
    }
  });
});

describe("payment window of micro and small suppliers (S-24)", () => {
  it("lists the five invoices beyond 45 days, ₹38,90,000, and no others", () => {
    const rows = msmeOverdue();
    expect(rows).toHaveLength(5);
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(38_90_000);
    expect(new Set(rows.map((r) => r.line.key))).toEqual(new Set(WORLD.anchors["S-24"]));
    expect(new Set(rows.map((r) => r.vendor)).size).toBe(3);
  });

  it("is ranked by the delay, and every item is a micro or small supplier past the window", () => {
    const rows = msmeOverdue();
    for (let i = 1; i < rows.length; i += 1) expect(rows[i - 1].overdue).toBeGreaterThanOrEqual(rows[i].overdue);
    for (const r of rows) {
      expect(["Micro", "Small"]).toContain(PARTY_BY_ID.get(r.line.partner!.id)!.msme);
      expect(r.days).toBe(r.overdue + P.msmePaymentDays);
      expect(r.overdue).toBeGreaterThan(0);
    }
    expect(rows[0].overdue).toBe(74);
  });

  it("reads at any date: only invoices past the window at that date, none posted after it", () => {
    for (const date of ["2026-06-30", "2026-08-15"] as const) {
      for (const r of msmeOverdue(date)) {
        expect(r.days, date).toBeGreaterThan(P.msmePaymentDays);
        expect(r.line.documentDate <= date, date).toBe(true);
      }
    }
  });
});
