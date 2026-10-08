import { describe, expect, it } from "vitest";
import { BALANCES, PARTY_BY_ID, WORLD, balanceAt } from "@/data";
import { WORKING_CAPITAL_POLICY as P } from "@/config/policies";
import { buOfProfitCentre } from "@/engine/attribution";
import { STEP_ORDER } from "@/engine/collections";
import { ageOf, type BucketId } from "@/engine/review";
import { WC_GLS, agedGrade, attention, balanceOf, drill, dsoExcess, dsoDrivers, dsoGrade, msmeOverdue, openOf, reliableFrom, reviewAgeing, statutoryAgeing, wcMetrics, wcTrend, type Side } from "@/engine/workingCapital";

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

describe("grading and the days of sales (FR-WCP-03)", () => {
  it("grades days of sales against the policy: on track up to 75, watch up to 90, act above", () => {
    expect([dsoGrade(40), dsoGrade(75), dsoGrade(75.1), dsoGrade(90), dsoGrade(90.1), dsoGrade(130)]).toEqual(["ok", "ok", "watch", "watch", "act", "act"]);
    expect([agedGrade(0), agedGrade(0.19), agedGrade(0.2), agedGrade(0.34), agedGrade(0.35), agedGrade(0.9)]).toEqual(["ok", "ok", "watch", "watch", "act", "act"]);
    expect([P.dsoWatchDays, P.dsoActionDays]).toEqual([75, 90]);
  });

  it("Process Automation is the one unit that needs action, at 93 days against the company's 62", () => {
    const grades = Object.fromEntries(BUS.filter((b) => b !== "CORP").map((b) => [b, dsoGrade(wcMetrics(MONTH, b).dso)]));
    expect(grades).toEqual({ EL: "ok", MO: "ok", PA: "act", RA: "ok" });
    expect(Math.round(wcMetrics(MONTH, "PA").dso)).toBe(93);
    expect(Math.round(wcMetrics(MONTH, "all").dso)).toBe(62);
  });

  it("the drivers of a unit's days add up to its days of sales, for the company and for each unit", () => {
    for (const bu of ["all", ...BUS.filter((b) => b !== "CORP")]) {
      const drivers = dsoDrivers(bu);
      expect(drivers.map((d) => d.id)).toEqual(["not-due", "remind", "confirm", "escalate", "retention", "unbilled", "credits"]);
      expect(drivers.reduce((s, d) => s + d.days, 0), bu).toBeCloseTo(wcMetrics(MONTH, bu).dso, 6);
      const m = wcMetrics(MONTH, bu).balances;
      expect(drivers.reduce((s, d) => s + d.amount, 0), bu).toBeCloseTo(m.receivables + m.unbilled + m.retention, 0);
    }
  });

  it("the days above the company add up to the unit's days less the company's", () => {
    for (const bu of BUS.filter((b) => b !== "CORP")) {
      const rows = dsoExcess(bu);
      expect(rows.reduce((s, r) => s + r.delta, 0), bu).toBeCloseTo(wcMetrics(MONTH, bu).dso - wcMetrics(MONTH, "all").dso, 6);
      for (const r of rows) expect(r.delta).toBeCloseTo(r.days - r.company, 9);
    }
  });

  it("names the units above the watch level, with their steps and the customers that hold the most", () => {
    const units = attention();
    expect(units.map((u) => u.bu)).toEqual(["PA"]);
    const pa = units[0];
    expect(pa.grade).toBe("act");
    expect(pa.excess).toBeCloseTo(wcMetrics(MONTH, "PA").dso - wcMetrics(MONTH, "all").dso, 6);
    // the steps are the drill's items that need a step, by step
    const d = drill("receivables", { bu: "PA" });
    expect(pa.steps.reduce((s, r) => s + r.count, 0)).toBe(d.total.toAct);
    expect(pa.toActAmount).toBeCloseTo(d.total.toActAmount, 2);
    for (const s of pa.steps) {
      const one = drill("receivables", { bu: "PA", step: s.id });
      expect([one.total.count, Math.round(one.total.amount)], s.id).toEqual([s.count, Math.round(s.amount)]);
    }
    // the most pressing first, and the customers by the amount they hold
    for (let i = 1; i < pa.steps.length; i += 1) expect(STEP_ORDER.findIndex((o) => o.id === pa.steps[i - 1].id)).toBeLessThan(STEP_ORDER.findIndex((o) => o.id === pa.steps[i].id));
    expect(pa.holders).toHaveLength(3);
    for (let i = 1; i < pa.holders.length; i += 1) expect(pa.holders[i - 1].amount).toBeGreaterThanOrEqual(pa.holders[i].amount);
    for (const h of pa.holders) expect(h.share).toBeCloseTo(h.amount / pa.toActAmount, 9);
  });
});

describe("drill filters", () => {
  it("an age band narrows every level to the items in it, and agrees with the review ageing", () => {
    for (const side of ["receivables", "payables"] as Side[]) {
      for (const row of reviewAgeing(side)) {
        const d = drill(side, { band: row.id as BucketId });
        expect(d.total.count, `${side} ${row.id}`).toBe(row.count);
        expect(d.total.amount, `${side} ${row.id}`).toBeCloseTo(row.amount, 2);
        expect(d.rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(row.amount, 2);
      }
    }
  });

  it("a next step narrows the view to the items with it, and filters combine with the path", () => {
    const all = drill("receivables", {});
    const byStep = STEP_ORDER.map((s) => drill("receivables", { step: s.id }).total);
    expect(byStep.reduce((s, t) => s + t.count, 0)).toBe(all.total.count);
    const pa = drill("receivables", { bu: "PA", step: "escalate", band: "365+" });
    for (const l of drill("receivables", { bu: "PA", step: "escalate", band: "365+" }, WORLD.asOf, true).items) expect(ageOf(l, WORLD.asOf)).toBeGreaterThan(365);
    expect(pa.total.count).toBeGreaterThan(0);
    expect(pa.total.count).toBeLessThan(drill("receivables", { bu: "PA", step: "escalate" }).total.count);
  });

  it("lists the documents of any view on request, with the next step of each, and not otherwise", () => {
    expect(drill("receivables", { bu: "PA" }).items).toHaveLength(0);
    const d = drill("receivables", { bu: "PA" }, WORLD.asOf, true);
    expect(d.items).toHaveLength(d.total.count);
    for (const l of d.items) expect(d.steps.get(l.key), l.key).toBeDefined();
  });

  it("a row's ageing bands add to its amount, and its past due part never exceeds it", () => {
    for (const r of drill("receivables", {}).rows) {
      expect(Object.values(r.bands).reduce((s, v) => s + v, 0)).toBeCloseTo(r.amount, 2);
      expect(r.pastDue).toBeLessThanOrEqual(r.amount + 0.01);
      expect(r.toAct).toBeLessThanOrEqual(r.count);
    }
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
