// The loaded world — generated once per session, deterministically — plus the
// indexes and selectors every module reads. One source: modules never keep
// their own copies of ledger data.

import type { GlAccount, IsoDate, LineItem, Party, Person, ProfitCentre, Project } from "@/types";
import { TENANT } from "@/config/tenant";
import { generateWorld } from "@/data/generator";
import { computeBalances, balanceAt } from "@/data/balances";
import { isOpenAt, runQualityChecks } from "@/data/quality";
import { describeDatasets } from "@/data/sources";

const started = performance.now();
export const WORLD = generateWorld();
export const BALANCES = computeBalances(WORLD.lines, WORLD.glAccounts, WORLD.asOf, TENANT.fiscalYear.startMonth);
export const QUALITY = runQualityChecks(WORLD, BALANCES);
export const DATASETS = describeDatasets(WORLD);
/** milliseconds taken to generate and validate the world in this session */
export const LOAD_MS = Math.round(performance.now() - started);

export const GL_BY_ID = new Map<string, GlAccount>(WORLD.glAccounts.map((g) => [g.gl, g]));
export const PARTY_BY_ID = new Map<string, Party>(WORLD.parties.map((p) => [p.id, p]));
export const PROJECT_BY_WBS = new Map<string, Project>(WORLD.projects.map((p) => [p.wbs, p]));
export const PERSON_BY_ID = new Map<string, Person>(WORLD.people.map((p) => [p.id, p]));
export const PC_BY_ID = new Map<string, ProfitCentre>(WORLD.profitCentres.map((p) => [p.id, p]));

export { balanceAt, isOpenAt };

/** Line items on open-item-managed accounts that are open at `asOf`. */
export function openItems(asOf: IsoDate = WORLD.asOf): LineItem[] {
  return WORLD.lines.filter((l) => GL_BY_ID.get(l.gl)?.openItemManaged && isOpenAt(l, asOf));
}

/** Number of distinct documents. */
export const DOCUMENT_COUNT = new Set(WORLD.lines.map((l) => `${l.fiscalYear}-${l.docNo}`)).size;
