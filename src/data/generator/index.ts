// generateWorld - builds the demo workspace's data foundation in one pass,
// deterministically from the workspace spec. Order matters: masters, reserved
// scenario masters, opening balances, open-item population, planted
// scenarios, monthly activity (sized around what is already posted),
// settlements, then the reference datasets derived from the ledger.

import type { World } from "@/types";
import { TENANT } from "@/config/tenant";
import { makeRng } from "@/data/rng";
import { buildChartOfAccounts } from "@/data/workspace/coa";
import { WORLD_SPEC as S } from "@/data/workspace/spec";
import { plantScenarios, reserveScenarioMasters } from "@/data/workspace/scenarios";
import { LedgerBuilder } from "@/data/generator/builder";
import { buildMasters } from "@/data/generator/masters";
import { createContext } from "@/data/generator/context";
import { generatePopulation } from "@/data/generator/population";
import { generateSettled } from "@/data/generator/settled";
import { postMigration, postMonthlyActivity, postSettlements } from "@/data/generator/activity";
import { buildBankGuarantees, buildFxRates, buildPurchaseOrders, buildTaxCredits } from "@/data/generator/reference";
import { generateReconciliations } from "@/data/generator/recs";
import { alignProjects } from "@/data/generator/projects";

export function generateWorld(): World {
  const rng = makeRng(S.seed);
  const masters = buildMasters(rng);
  const reserved = new Set<string>();
  const refs = reserveScenarioMasters(masters, reserved);

  const builder = new LedgerBuilder(S.companyCode, TENANT.fiscalYear.startMonth, S.erpGoLive, {
    erp: TENANT.sourceSystems[0],
    legacy: TENANT.sourceSystems[1],
  });
  const ctx = createContext(rng, builder, masters, reserved);

  postMigration(ctx);
  generatePopulation(ctx);
  generateSettled(ctx);
  plantScenarios(ctx, refs);
  postMonthlyActivity(ctx);
  postSettlements(ctx);
  alignProjects(ctx, builder.lines, S.seed + 13);

  const lines = builder.lines.sort((a, b) =>
    a.postingDate === b.postingDate ? a.key.localeCompare(b.key) : a.postingDate.localeCompare(b.postingDate)
  );

  const glAccounts = buildChartOfAccounts();
  const fxRates = buildFxRates();
  const purchaseOrders = buildPurchaseOrders(ctx);

  return {
    asOf: S.asOf,
    extractedAt: S.extractedAt,
    businessUnits: [...TENANT.businessUnits, { id: S.corporateProfitCentre.businessUnitId, name: "Corporate" }],
    profitCentres: masters.profitCentres,
    projects: masters.projects,
    people: masters.people,
    parties: masters.parties,
    glAccounts,
    lines,
    purchaseOrders,
    bankGuarantees: buildBankGuarantees(ctx),
    taxCredits: buildTaxCredits(ctx),
    fxRates,
    reconciliations: generateReconciliations({
      lines, gls: glAccounts, parties: masters.parties, purchaseOrders, fxRates, anchors: ctx.anchors,
      asOf: S.asOf, seed: S.seed + 11, fyStartMonth: TENANT.fiscalYear.startMonth,
    }),
    anchors: ctx.anchors,
  };
}
