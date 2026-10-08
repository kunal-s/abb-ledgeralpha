// Aligns the projects with the revenue the ledger already carries. The random
// population books revenue against projects without regard to their size and
// books cost to no project at all (and leaves them off the cost lines), so a project table read from it would show
// revenue several times the contract and no cost. Nothing is posted and no
// amount changes: contract values are set from the revenue booked and the
// stage, and existing material cost lines of the project's profit centre are
// tagged to it until its cost reaches a margin drawn for the project. Reserved
// (planted) projects are left exactly as the scenarios made them.

import type { LineItem, Project } from "@/types";
import { makeRng } from "@/data/rng";
import type { Ctx } from "@/data/generator/context";

/** margin before staff and depreciation that the business units run at; a project's own margin is drawn around it */
const BASE_MARGIN: Record<string, number> = { EL: 0.22, MO: 0.24, PA: 0.3, RA: 0.33 };
/** project cost is materials and the running costs charged to the site (repairs, freight, travel, services) */
const PROJECT_COST_GLS = new Set(["510100", "530300", "530400", "530500", "530600", "530900", "531900"]);

/** share of the contract recognised as revenue, by stage */
const RECOGNISED: Record<Project["stage"], [number, number]> = {
  Execution: [0.35, 0.85],
  "On hold": [0.3, 0.7],
  Commissioned: [0.88, 0.98],
  "In DLP": [1, 1],
  "DLP ended": [1, 1],
  Closed: [1, 1],
};

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to;

export function alignProjects(ctx: Ctx, lines: LineItem[], seed: number): void {
  const rng = makeRng(seed);
  const revenue = new Map<string, number>();
  for (const l of lines) if (l.wbs && l.gl.startsWith("41") && l.postingDate <= ctx.asOf) revenue.set(l.wbs, (revenue.get(l.wbs) ?? 0) - l.amount);

  // cost lines nobody has tagged, by profit centre, largest first
  const pool = new Map<string, LineItem[]>();
  for (const l of lines) {
    if (!PROJECT_COST_GLS.has(l.gl) || l.wbs || l.amount <= 0) continue;
    const list = pool.get(l.profitCentre) ?? [];
    list.push(l);
    pool.set(l.profitCentre, list);
  }
  for (const list of pool.values()) list.sort((a, b) => b.amount - a.amount || a.key.localeCompare(b.key));

  // each project's contract value and the cost it should carry
  const targets: { p: Project; target: number }[] = [];
  for (const p of ctx.m.projects) {
    if (ctx.reserved.has(p.wbs)) continue;
    const r = revenue.get(p.wbs);
    if (!r || r <= 0) continue;
    const [lo, hi] = RECOGNISED[p.stage];
    p.contractValue = roundUp(r / rng.range(lo, hi), 1_00_000);
    const bu = p.profitCentreId.split("-")[1];
    const squeezed = rng.chance(0.08);
    const margin = squeezed ? rng.range(-0.04, 0.08) : (BASE_MARGIN[bu] ?? 0.4) + rng.range(-0.12, 0.1);
    targets.push({ p, target: r * (1 - margin) });
  }

  // the largest projects choose first; each takes the biggest line that still fits, until what is left is smaller than any line
  targets.sort((a, b) => b.target - a.target || a.p.wbs.localeCompare(b.p.wbs));
  for (const { p, target } of targets) {
    const list = pool.get(p.profitCentreId) ?? [];
    let remaining = target;
    for (let i = 0; i < list.length && remaining > 0; ) {
      if (list[i].amount <= remaining * 1.01) {
        list[i].wbs = p.wbs;
        remaining -= list[i].amount;
        list.splice(i, 1);
      } else i += 1;
    }
  }
}
