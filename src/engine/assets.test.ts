import { describe, expect, it } from "vitest";
import { BALANCES, GL_BY_ID, WORLD } from "@/data";
import { assetChecks, assetRows, registerTotals } from "@/engine/assets";
import { allocate } from "@/data/generator/assets";
import { daysBetween } from "@/lib/dates";

const closing = (gl: string) => (BALANCES.byGl.get(gl) ?? []).find((b) => b.periodEnd === WORLD.asOf)?.closing ?? 0;

describe("fixed asset register", () => {
  const costGls = [...new Set(WORLD.assets.map((a) => a.gl))];

  it("covers every fixed asset cost account that carries a balance", () => {
    for (const g of WORLD.glAccounts.filter((x) => x.category === "fixed-assets" && x.normalBalance === "Dr" && closing(x.gl) !== 0)) expect(costGls, g.gl).toContain(g.gl);
  });

  it("ties to the cost account and to the accumulated depreciation account, to the rupee", () => {
    for (const gl of costGls) {
      const rows = assetRows(gl).filter((r) => r.asset.gl === gl);
      const t = registerTotals(rows);
      expect(t.closingCost, gl).toBe(closing(gl));
      const dep = rows[0].asset.accDepGl;
      if (dep) expect(t.closingAccDep, dep).toBe(-closing(dep));
      else expect(t.closingAccDep, gl).toBe(0);
    }
  });

  it("never depreciates an asset beyond its cost, and never depreciates land", () => {
    for (const a of WORLD.assets) {
      expect(a.openingAccDep + a.depreciation, a.id).toBeLessThanOrEqual(a.openingCost + a.additions);
      expect(a.openingAccDep, a.id).toBeGreaterThanOrEqual(0);
      if (GL_BY_ID.get(a.gl)?.description === "Land") expect(a.openingAccDep + a.depreciation, a.id).toBe(0);
    }
  });

  it("makes each capitalisation in the period an asset added in the period", () => {
    const added = WORLD.assets.filter((a) => a.additions > 0);
    expect(added.length).toBeGreaterThan(0);
    for (const a of added) {
      const line = WORLD.lines.find((l) => l.key === a.capitalisationKey)!;
      expect(line.amount).toBe(a.additions);
      expect(a.openingCost).toBe(0);
    }
  });

  it("builds the land's cost from price and duties", () => {
    for (const a of WORLD.assets.filter((x) => x.gl === "110100")) expect(a.costParts!.reduce((s, p) => s + p.amount, 0)).toBe(a.openingCost + a.additions);
  });

  it("rates each asset by its most serious check: title, use, verification, useful life", () => {
    const land = assetRows("110100");
    expect(land.find((r) => r.asset.title === "Not in company name")!.risk).toBe("High");
    expect(land.find((r) => r.asset.usage === "Idle")!.checks.map((c) => c.id)).toContain("idle");
    expect(assetRows("110200").find((r) => r.asset.usage === "Partly let out")!.risk).toBe("High");
    const stale = WORLD.assets.find((a) => daysBetween(a.lastVerified, WORLD.asOf) > 730)!;
    expect(assetChecks(stale, WORLD.asOf).map((c) => c.id)).toContain("verify");
    const fresh = WORLD.assets.find((a) => a.title === "In company name" && a.usage === "In use" && daysBetween(a.lastVerified, WORLD.asOf) < 365)!;
    expect(assetChecks(fresh, WORLD.asOf).filter((c) => c.severity !== "Low")).toEqual([]);
  });

  it("splits a total exactly, within caps", () => {
    const even = allocate(1000, [1, 1, 1]);
    expect(even.reduce((s, p) => s + p, 0)).toBe(1000);
    expect(Math.max(...even) - Math.min(...even)).toBeLessThanOrEqual(1);
    const parts = allocate(1000, [5, 1, 1], [300, 1000, 1000]);
    expect(parts.reduce((s, p) => s + p, 0)).toBe(1000);
    expect(parts[0]).toBeLessThanOrEqual(300);
  });
});
