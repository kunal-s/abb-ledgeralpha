// Project controlling snapshots: cost booked to date and the estimate at
// completion at each month end of the last six months, for projects under
// way. From the project master and a hash of each project, so the rest of the
// world is untouched. The S-22 project's estimate rises by the copper price
// effect in September (docs/FRD.md §9.4).

import type { IsoDate, Project, ProjectEstimate } from "@/types";
import { daysBetween } from "@/lib/dates";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { unit } from "@/data/generator/pricing";

export const ESTIMATE_MONTH_ENDS: IsoDate[] = ["2026-04-30", "2026-05-31", "2026-06-30", "2026-07-31", "2026-08-31", "2026-09-30"];

/** The rise in the estimate at completion of the project that buys the copper: 40,000 kg-eq at 110 more per kg-eq. */
export const COPPER_ESTIMATE_RISE = 44_00_000;

export function buildProjectEstimates(projects: Project[], copperProject: Project): ProjectEstimate[] {
  const projectPcs = new Set(S.profitCentres.filter((p) => p.projectBusiness).map((p) => p.id));
  const out: ProjectEstimate[] = [];
  for (const p of projects) {
    if (!projectPcs.has(p.profitCentreId) || (p.stage !== "Execution" && p.stage !== "Commissioned")) continue;
    const plannedMargin = 0.09 + 0.13 * unit(`${p.wbs}-margin`);
    const budgetCost = Math.round(p.contractValue * (1 - plannedMargin));
    const drift = (unit(`${p.wbs}-drift`) - 0.35) * 0.06;
    const duration = 730 + Math.round(540 * unit(`${p.wbs}-span`));
    let previous = budgetCost;
    ESTIMATE_MONTH_ENDS.forEach((monthEnd, i) => {
      let eac = Math.round(budgetCost * (1 + (drift * (i + 1)) / 6));
      if (p.wbs === copperProject.wbs) {
        // steady until the copper price moved
        eac = i < 5 ? Math.round(budgetCost * (1 + 0.004 * (i + 1))) : previous + COPPER_ESTIMATE_RISE;
      }
      previous = eac;
      const progress = p.stage === "Commissioned" ? 0.96 + 0.03 * (i / 5) : Math.min(0.93, Math.max(0.04, daysBetween(p.startDate, monthEnd) / duration));
      out.push({ wbs: p.wbs, monthEnd, costToDate: Math.round(eac * progress), estimateAtCompletion: eac });
    });
  }
  return out;
}
