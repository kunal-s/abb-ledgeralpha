// The loaded world - generated once per session, deterministically - plus the
// indexes and selectors every module reads. One source: modules never keep
// their own copies of ledger data.

import type { GlAccount, IsoDate, LineItem, Party, Person, ProfitCentre, Project, Reconciliation } from "@/types";
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
export const REC_BY_ID = new Map<string, Reconciliation>(WORLD.reconciliations.map((r) => [r.id, r]));

/** Accounts a counterparty statement covers, per reconciliation type. */
const STATEMENT_GLS: Partial<Record<Reconciliation["type"], string[]>> = {
  "Customer statement": ["140100", "142100"],
  "Vendor statement": ["210100"],
  Intercompany: ["140300", "164100", "210300", "251100"],
};

/** The open items behind a counterparty reconciliation: the statement we send or compare against. */
export function statementItems(rec: Reconciliation, asOf: IsoDate = WORLD.asOf): LineItem[] {
  const gls = STATEMENT_GLS[rec.type];
  if (!gls || !rec.partyId) return [];
  return WORLD.lines.filter((l) => l.partner?.id === rec.partyId && gls.includes(l.gl) && isOpenAt(l, asOf)).sort((a, b) => a.postingDate.localeCompare(b.postingDate));
}

/** Ledger lines of a customer on receivables and retention, cleared or open (what a customer statement covers). */
const CUSTOMER_STATEMENT_GLS = new Set(["140100", "142100"]);
const customerLineCache = new Map<string, LineItem[]>();
export function customerStatementLines(partyId: string): LineItem[] {
  let lines = customerLineCache.get(partyId);
  if (!lines) {
    lines = WORLD.lines.filter((l) => l.partner?.id === partyId && CUSTOMER_STATEMENT_GLS.has(l.gl));
    customerLineCache.set(partyId, lines);
  }
  return lines;
}

export const LINE_BY_KEY = new Map<string, LineItem>(WORLD.lines.map((l) => [l.key, l]));

function group<K>(lines: LineItem[], keyOf: (l: LineItem) => K | undefined): Map<K, LineItem[]> {
  const m = new Map<K, LineItem[]>();
  for (const l of lines) {
    const k = keyOf(l);
    if (k === undefined) continue;
    const list = m.get(k);
    if (list) list.push(l);
    else m.set(k, [l]);
  }
  return m;
}

/** All lines of one document (the double entry). */
export const LINES_BY_DOC = group(WORLD.lines, (l) => `${l.fiscalYear}-${l.docNo}`);
/** All lines posted against one purchase order. */
export const LINES_BY_PO = group(WORLD.lines, (l) => l.po?.number);

export { balanceAt, isOpenAt };

/** Line items on open-item-managed accounts that are open at `asOf`. */
export function openItems(asOf: IsoDate = WORLD.asOf): LineItem[] {
  return WORLD.lines.filter((l) => GL_BY_ID.get(l.gl)?.openItemManaged && isOpenAt(l, asOf));
}

/** Number of distinct documents. */
export const DOCUMENT_COUNT = new Set(WORLD.lines.map((l) => `${l.fiscalYear}-${l.docNo}`)).size;
