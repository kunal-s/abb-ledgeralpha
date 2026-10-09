// The fixed asset register for the review period, sized from the ledger so it
// ties exactly: each cost account's balance at the start of the period is spread
// over its assets, each capitalisation posting in the period becomes an asset,
// accumulated depreciation is spread in proportion to how far through its life
// each asset is (acquisition dates follow from that), and the period's
// depreciation run is spread over the assets still being depreciated. Own random
// stream, so the rest of the world does not move.

import type { FixedAsset, GlAccount, IsoDate, LineItem } from "@/types";
import { makeRng, type Rng } from "@/data/rng";
import { closingFromLines } from "@/data/balances";
import { addDays, daysBetween } from "@/lib/dates";
import { ASSET_SITES, BUILDING_LIFE, IMMOVABLE, MOVABLE } from "@/data/workspace/assets";

interface Input {
  lines: LineItem[];
  gls: GlAccount[];
  asOf: IsoDate;
  prior: IsoDate;
  seed: number;
  fyStartMonth: number;
}

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);

/** Split a whole-rupee total by weights, never giving a part more than its cap; rounding goes where there is room. */
export function allocate(total: number, weights: number[], caps: number[] = weights.map(() => Infinity)): number[] {
  const parts = weights.map(() => 0);
  let left = total;
  let open = weights.map((w, i) => (w > 0 && caps[i] > 0 ? i : -1)).filter((i) => i >= 0);
  for (let pass = 0; pass < 8 && open.length && Math.abs(left) > 0; pass++) {
    const w = sum(open.map((i) => weights[i]));
    const next: number[] = [];
    let given = 0;
    for (const i of open) {
      const share = Math.round((left * weights[i]) / w);
      const room = caps[i] - parts[i];
      const take = Math.min(share, room);
      parts[i] += take;
      given += take;
      if (take < room) next.push(i);
    }
    left -= given;
    open = next;
  }
  // rounding: a rupee at a time where there is room
  for (let i = 0; Math.abs(left) > 0 && i < parts.length * 2; i++) {
    const k = i % parts.length;
    if (weights[k] <= 0) continue;
    const room = left > 0 ? caps[k] - parts[k] : parts[k];
    const step = Math.sign(left) * Math.min(Math.abs(left), room);
    parts[k] += step;
    left -= step;
  }
  return parts;
}

function lastVerified(rng: Rng, asOf: IsoDate): IsoDate {
  return rng.chance(0.92) ? addDays(asOf, -rng.int(30, 540)) : addDays(asOf, -rng.int(760, 980));
}

export function buildAssetRegister(inp: Input): FixedAsset[] {
  const rng = makeRng(inp.seed);
  const { asOf, prior } = inp;
  const opening = closingFromLines(inp.lines, inp.gls, prior, inp.fyStartMonth);
  const bal = (gl: string) => opening.get(gl)?.closing ?? 0;
  const period = inp.lines.filter((l) => l.postingDate > prior && l.postingDate <= asOf);
  const quarterDays = daysBetween(prior, asOf);
  const out: FixedAsset[] = [];
  const seq = new Map<string, number>();
  const nextId = (gl: string) => {
    const n = (seq.get(gl) ?? 0) + 1;
    seq.set(gl, n);
    return `FA-${gl}-${String(n).padStart(3, "0")}`;
  };

  /** Capitalisations in the period on a cost account: each one is a new asset. */
  const capitalised = (gl: string, accDepGl: string | undefined, life: number | undefined, names: string[]): FixedAsset[] =>
    period
      .filter((l) => l.gl === gl && l.amount > 0)
      .map((l, i) => {
        const site = rng.pick(ASSET_SITES);
        return {
          id: nextId(gl), gl, accDepGl, description: `${names[(i + 3) % names.length]}, ${site}`, site,
          acquired: l.postingDate, usefulLifeYears: life, openingCost: 0, additions: l.amount, capitalisationKey: l.key, openingAccDep: 0, depreciation: 0,
          usage: "In use" as const, lastVerified: l.postingDate,
        };
      });

  /** Accumulated depreciation at the start, spread by how far through its life each asset is; acquisition dates follow. */
  const depreciate = (assets: FixedAsset[], accDepGl: string, fully: number) => {
    const existing = assets.filter((a) => a.openingCost > 0);
    const total = -bal(accDepGl);
    const ratio = total / Math.max(1, sum(existing.map((a) => a.openingCost)));
    const fractions = existing.map((_, i) => (i < fully ? 1 : Math.min(0.97, Math.max(0.05, ratio + rng.range(-0.3, 0.22)))));
    const acc = allocate(total, existing.map((a, i) => a.openingCost * fractions[i]), existing.map((a) => a.openingCost));
    existing.forEach((a, i) => {
      a.openingAccDep = acc[i];
      const used = a.openingAccDep / a.openingCost;
      const life = a.usefulLifeYears ?? BUILDING_LIFE;
      const days = used >= 0.999 ? Math.round((life + rng.range(0.5, 4)) * 365) : Math.round(used * life * 365);
      a.acquired = addDays(prior, -Math.max(30, days));
    });
    // the period's depreciation run, over the assets still being depreciated
    const charge = -sum(period.filter((l) => l.gl === accDepGl).map((l) => l.amount));
    const weights = assets.map((a) => {
      const cost = a.openingCost + a.additions;
      const room = cost - a.openingAccDep;
      if (room <= 0) return 0;
      const inService = a.openingCost > 0 ? 1 : Math.max(0, daysBetween(a.acquired, asOf)) / quarterDays;
      return (cost / (a.usefulLifeYears ?? BUILDING_LIFE)) * inService;
    });
    const caps = assets.map((a) => a.openingCost + a.additions - a.openingAccDep);
    allocate(charge, weights, caps).forEach((c, i) => (assets[i].depreciation = c));
  };

  // ---- immovable property ------------------------------------------------------------------
  for (const gl of ["110100", "110200"] as const) {
    const specs = IMMOVABLE.filter((s) => s.gl === gl);
    const costs = allocate(bal(gl), specs.map((s) => s.share));
    const assets: FixedAsset[] = specs.map((s, i) => ({
      id: nextId(gl), gl, accDepGl: gl === "110200" ? "119200" : undefined, description: s.description, site: s.site,
      acquired: s.acquired ?? prior, usefulLifeYears: gl === "110200" ? BUILDING_LIFE : undefined, openingCost: costs[i], additions: 0, openingAccDep: 0, depreciation: 0,
      costParts: s.costParts ? (() => {
        const p = allocate(costs[i], s.costParts);
        return [{ label: "Purchase price", amount: p[0] }, { label: "Stamp duty", amount: p[1] }, { label: "Registration", amount: p[2] }, { label: "Legal and other costs", amount: p[3] }];
      })() : undefined,
      title: s.title, titleNote: s.titleNote, usage: s.usage, usageSince: s.usageSince, lastVerified: s.lastVerified,
    }));
    assets.push(...capitalised(gl, gl === "110200" ? "119200" : undefined, gl === "110200" ? BUILDING_LIFE : undefined, [gl === "110200" ? "Building extension" : "Land"]));
    if (gl === "110200") depreciate(assets, "119200", 0);
    out.push(...assets);
  }

  // ---- movable assets and software ----------------------------------------------------------
  for (const m of MOVABLE) {
    const weights = Array.from({ length: m.count }, () => rng.range(0.3, 3) ** 1.6);
    const costs = allocate(bal(m.gl), weights);
    const assets: FixedAsset[] = costs.map((c, i) => {
      const site = rng.pick(ASSET_SITES);
      return {
        id: nextId(m.gl), gl: m.gl, accDepGl: m.accDepGl, description: `${m.names[i % m.names.length]}, ${site}`, site, acquired: prior, usefulLifeYears: m.life,
        openingCost: c, additions: 0, openingAccDep: 0, depreciation: 0, usage: "In use" as const, lastVerified: lastVerified(rng, asOf),
      };
    });
    // a machine laid up after a product line moved, to give the review an impairment question
    if (m.gl === "110300") {
      const idle = assets[assets.length - 4];
      idle.usage = "Idle";
      idle.usageSince = addDays(asOf, -rng.int(380, 470));
    }
    assets.push(...capitalised(m.gl, m.accDepGl, m.life, m.names));
    depreciate(assets, m.accDepGl, m.gl === "110300" ? 3 : m.gl === "110600" ? 2 : 0);
    out.push(...assets);
  }
  return out;
}
