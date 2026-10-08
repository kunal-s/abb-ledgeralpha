import { describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { budgetMonth, budgetRange } from "@/engine/budget";
import { projectRows, resultsTable } from "@/engine/management";
import { addRows, emptyRow, monthsBetween, plMonth, plRange, scopePcs, type PlRow } from "@/engine/pl";

const COMPANY_PCS = scopePcs({ kind: "company" });
const close = (a: PlRow, b: PlRow, label: string) => {
  for (const k of Object.keys(a) as (keyof PlRow)[]) expect(Math.abs(a[k] - b[k]), `${label} ${k}`).toBeLessThan(0.01);
};

describe("management results", () => {
  const rows = resultsTable("2026-09");

  it("lists the company, then each business unit followed by its profit centres", () => {
    expect(rows).toHaveLength(1 + WORLD.businessUnits.length + WORLD.profitCentres.length);
    expect(rows[0]).toMatchObject({ id: "company", level: "company" });
    for (const bu of WORLD.businessUnits) {
      const i = rows.findIndex((r) => r.id === bu.id);
      expect(rows[i].level).toBe("bu");
      const pcs = WORLD.profitCentres.filter((p) => p.businessUnitId === bu.id);
      expect(rows.slice(i + 1, i + 1 + pcs.length).map((r) => r.id)).toEqual(pcs.map((p) => p.id));
      for (const r of rows.slice(i + 1, i + 1 + pcs.length)) expect(r).toMatchObject({ level: "pc", parentId: bu.id });
    }
  });

  it("each level adds up to the level above it, for the month, the budget and the year to date", () => {
    const company = rows[0];
    for (const key of ["month", "prior", "budget", "ytd", "ytdBudget"] as const) {
      const bus = rows.filter((r) => r.level === "bu").reduce((acc, r) => addRows(acc, r[key]), emptyRow());
      close(company[key], bus, `company ${key}`);
      for (const bu of rows.filter((r) => r.level === "bu")) {
        const pcs = rows.filter((r) => r.parentId === bu.id).reduce((acc, r) => addRows(acc, r[key]), emptyRow());
        close(bu[key], pcs, `${bu.id} ${key}`);
      }
    }
  });

  it("reads the same report lines as the variance analysis and the statements", () => {
    const company = rows[0];
    close(company.month, plMonth("2026-09", COMPANY_PCS), "month");
    close(company.prior, plMonth("2026-08", COMPANY_PCS), "prior");
    close(company.budget, budgetMonth("2026-09", COMPANY_PCS), "budget");
    close(company.ytd, plRange("2026-01", "2026-09", COMPANY_PCS), "ytd");
    close(company.ytdBudget, budgetRange("2026-01", "2026-09", COMPANY_PCS), "ytd budget");
    const ytd = monthsBetween("2026-01", "2026-09").reduce((acc, m) => addRows(acc, plMonth(m, COMPANY_PCS)), emptyRow());
    close(company.ytd, ytd, "ytd by months");
  });

  it("starts the year to date in January, and has no budget before the budget year", () => {
    const jan = resultsTable("2026-01")[0];
    close(jan.ytd, jan.month, "january");
    expect(resultsTable("2025-12")[0].budget.revenue).toBe(0);
    expect(resultsTable("2025-12")[0].ytdBudget.revenue).toBe(0);
  });
});

describe("projects", () => {
  const rows = projectRows();
  const s22 = WORLD.pricedReceipts.find((r) => r.lineKey === WORLD.anchors["S-22"][0])!.wbs!;

  it("covers the projects under way, those with the largest rise in the estimate first", () => {
    expect(rows.length).toBeGreaterThan(80);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i - 1].estimateChange).toBeGreaterThanOrEqual(rows[i].estimateChange);
    for (const r of rows) expect(["Execution", "Commissioned"]).toContain(r.project.stage);
  });

  it("the S-22 project has the largest rise, exactly the copper effect, and its margin falls", () => {
    const top = rows[0];
    expect(top.project.wbs).toBe(s22);
    expect(top.estimateChange).toBe(44_00_000);
    expect(top.marginPercent).toBeLessThan(top.priorMarginPercent!);
    expect(rows[1].estimateChange).toBeLessThan(top.estimateChange);
    expect(top.project.name).toContain("Signalling power supply");
  });

  it("derives percentage complete from cost over the estimate, and the revenue and margin from it", () => {
    for (const r of rows) {
      expect(r.percentComplete, r.project.wbs).toBeGreaterThanOrEqual(0);
      expect(r.percentComplete, r.project.wbs).toBeLessThanOrEqual(1);
      expect(r.percentComplete).toBeCloseTo(Math.min(1, r.costToDate / r.estimateAtCompletion), 10);
      expect(r.revenueEarned).toBeCloseTo(r.percentComplete * r.contractValue, 2);
      expect(r.marginAtCompletion).toBe(r.contractValue - r.estimateAtCompletion);
      expect(r.marginPercent).toBeCloseTo(r.marginAtCompletion / r.contractValue, 10);
      expect(r.trend).toHaveLength(6);
      expect(r.trend.at(-1)!.marginPercent).toBeCloseTo(r.marginPercent, 10);
    }
  });

  it("reads the estimates up to the date given, so an earlier date does not see September", () => {
    const aug = projectRows("2026-08-31");
    expect(aug.length).toBe(rows.length);
    for (const r of aug) expect(r.trend.at(-1)!.monthEnd <= "2026-08-31").toBe(true);
    expect(aug.find((r) => r.project.wbs === s22)!.estimateChange).toBeLessThan(44_00_000);
  });
});
