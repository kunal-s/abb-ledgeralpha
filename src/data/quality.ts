// Load validation - the checks every dataset passes before modules use it
// (docs/FRD.md §4.1). Each check reports what it examined and any exceptions,
// with sample record keys for drill-down.

import type { DataQualityCheck, IsoDate, LineItem, World } from "@/types";
import { balanceAt, type BalanceTable } from "@/data/balances";

const PAN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/;
const GSTIN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/;
const ACCOUNT_NO = /\b\d{11,16}\b/;

export function isOpenAt(l: LineItem, asOf: IsoDate): boolean {
  return l.postingDate <= asOf && (!l.clearing || l.clearing.date > asOf);
}

function check(id: string, name: string, items: number, failures: string[]): DataQualityCheck {
  return { id, name, checked: items, exceptions: failures.length, samples: failures.slice(0, 5) };
}

export function runQualityChecks(world: World, balances: BalanceTable): DataQualityCheck[] {
  const { lines, asOf } = world;
  const parties = new Set(world.parties.map((p) => p.id));
  const projects = new Set(world.projects.map((p) => p.wbs));
  const pos = new Set(world.purchaseOrders.map((p) => `${p.po}/${p.item}`));
  const pcs = new Set(world.profitCentres.map((p) => p.id));
  const glById = new Map(world.glAccounts.map((g) => [g.gl, g]));

  // documents balance
  const docSum = new Map<string, number>();
  for (const l of lines) {
    const k = `${l.companyCode}-${l.fiscalYear}-${l.docNo}`;
    docSum.set(k, (docSum.get(k) ?? 0) + l.amount);
  }
  const unbalanced = [...docSum.entries()].filter(([, s]) => s !== 0).map(([k]) => k);

  // trial balance nets to zero every period
  const tbFailures = balances.periods.filter((p) => {
    let sum = 0;
    for (const rows of balances.byGl.values()) sum += rows[balances.periods.indexOf(p)].closing;
    return sum !== 0;
  });

  // open items agree to the account balance (open-item-managed accounts)
  const oiGls = world.glAccounts.filter((g) => g.openItemManaged);
  const openSum = new Map<string, number>();
  for (const l of lines) {
    if (glById.get(l.gl)?.openItemManaged && isOpenAt(l, asOf)) openSum.set(l.gl, (openSum.get(l.gl) ?? 0) + l.amount);
  }
  const oiFailures = oiGls.filter((g) => (openSum.get(g.gl) ?? 0) !== (balanceAt(balances, g.gl, asOf)?.closing ?? 0)).map((g) => g.gl);

  // clearing documents net to zero per account
  const clearSum = new Map<string, number>();
  for (const l of lines) {
    if (!l.clearing) continue;
    const k = `${l.gl}|${l.clearing.docNo}|${l.clearing.date}`;
    clearSum.set(k, (clearSum.get(k) ?? 0) + l.amount);
  }
  const clearingFailures = [...clearSum.entries()].filter(([, s]) => s !== 0).map(([k]) => k);

  const keys = new Set<string>();
  const duplicates: string[] = [];
  const partnerFailures: string[] = [];
  const wbsFailures: string[] = [];
  const poFailures: string[] = [];
  const pcFailures: string[] = [];
  const glFailures: string[] = [];
  const futureFailures: string[] = [];
  const maskingFailures: string[] = [];
  let withPartner = 0;
  let withWbs = 0;
  let withPo = 0;
  let withText = 0;
  for (const l of lines) {
    if (keys.has(l.key)) duplicates.push(l.key);
    keys.add(l.key);
    if (!glById.has(l.gl)) glFailures.push(l.key);
    if (l.partner) {
      withPartner++;
      if (!parties.has(l.partner.id)) partnerFailures.push(l.key);
    }
    if (l.wbs) {
      withWbs++;
      if (!projects.has(l.wbs)) wbsFailures.push(l.key);
    }
    if (l.po) {
      withPo++;
      if (!pos.has(`${l.po.number}/${l.po.item}`)) poFailures.push(l.key);
    }
    if (!pcs.has(l.profitCentre)) pcFailures.push(l.key);
    if (l.postingDate > asOf) futureFailures.push(l.key);
    const text = `${l.text ?? ""} ${l.assignment ?? ""} ${l.reference ?? ""}`;
    if (text.trim()) {
      withText++;
      if (PAN.test(text) || GSTIN.test(text) || ACCOUNT_NO.test(text)) maskingFailures.push(l.key);
    }
  }

  return [
    check("doc-balance", "Every document balances", docSum.size, unbalanced),
    check("tb-zero", "Trial balance nets to zero in every period", balances.periods.length, tbFailures),
    check("oi-agree", "Open items agree to the account balance", oiGls.length, oiFailures),
    check("clearing", "Cleared items net to zero per clearing document", clearSum.size, clearingFailures),
    check("unique", "Line keys are unique", lines.length, duplicates),
    check("gl", "Every line posts to a known GL account", lines.length, glFailures),
    check("partner", "Business partner references resolve", withPartner, partnerFailures),
    check("wbs", "Project / WBS references resolve", withWbs, wbsFailures),
    check("po", "Purchase order references resolve", withPo, poFailures),
    check("pc", "Every line carries a valid profit centre", lines.length, pcFailures),
    check("future", "No postings after the period end", lines.length, futureFailures),
    check("masking", "No unmasked tax IDs or account numbers in free text", withText, maskingFailures),
  ];
}
