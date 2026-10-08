// Variance analysis (docs/FRD.md §6.15): why the operating result of a scope
// moved between a month and a comparator (the month before, or the budget),
// as a bridge whose components add up to the total exactly (FR-VAR-01). Every
// component is computed from the ledger, the price list and the price
// reference; the transactions that drove it are listed with their documents.

import type { PricedReceipt } from "@/types";
import { GL_BY_ID, PROJECT_BY_WBS, WORLD } from "@/data";
import { PRICE_ACTIONS } from "@/data/workspace/pricing";
import { budgetMonth, hasBudget } from "@/engine/budget";
import { FX_GAIN_GL, FX_LOSS_GL, ONE_OFF_EXPENSE_GLS, ONE_OFF_INCOME_GLS, margin, operatingResult, plMonth, previousMonth, scopeLabel, scopePcs, type PlRow, type Scope } from "@/engine/pl";
import { buOfProfitCentre } from "@/engine/attribution";
import { fmtMonth } from "@/lib/dates";
import { fmtINRCompact } from "@/lib/format";

export type Comparator = "prior-month" | "budget";

export const COMPARATORS: { key: Comparator; label: string }[] = [
  { key: "prior-month", label: "Prior month" },
  { key: "budget", label: "Budget" },
];

export type ComponentId = "price" | "volume" | "material-price" | "material-usage" | "employee" | "depreciation" | "fx" | "one-offs" | "other";

export interface BridgeComponent {
  id: ComponentId;
  label: string;
  /** effect on the operating result: positive improves it */
  effect: number;
  /** how it is computed, for the tooltip */
  definition: string;
}

export interface Driver {
  id: string;
  kind: "material-price" | "one-off" | "exchange";
  title: string;
  /** effect on the variance of the operating result */
  effect: number;
  month: string;
  profitCentreId: string;
  wbs?: string;
  lineKey: string;
  docKey: string;
  /** the vendor, for a priced receipt */
  vendorId?: string;
  po?: string;
}

export interface VarianceResult {
  scope: Scope;
  month: string;
  comparator: Comparator;
  baseLabel: string;
  current: PlRow;
  base: PlRow;
  resultCurrent: number;
  resultBase: number;
  delta: number;
  marginCurrent?: number;
  marginBase?: number;
  components: BridgeComponent[];
  /** the components less the total: zero when the bridge is complete */
  residual: number;
  ppv: { current: number; base: number };
  drivers: Driver[];
  /** the date the comparator's price list applies, for the price effect */
  priceNote: string;
}

// ---------------------------------------------------------------------------
// price list
// ---------------------------------------------------------------------------
/** The list price level of a business unit's products in a month, 1 before any action. */
export function priceIndex(pcId: string, month: string): number {
  const bu = buOfProfitCentre(pcId);
  return PRICE_ACTIONS.filter((a) => a.businessUnitId === bu && a.effective.slice(0, 7) <= month).reduce((p, a) => p * (1 + a.percent / 100), 1);
}

/** The level the plan assumes: no action after the year before the budget year. */
export const planPriceIndex = (pcId: string): number => priceIndex(pcId, "2025-12");

// ---------------------------------------------------------------------------
// purchase price variance
// ---------------------------------------------------------------------------
export const ppvOf = (r: PricedReceipt): number => r.quantity * (r.invoicePrice - r.standardPrice);

export function receiptsIn(month: string, pcs: readonly string[]): PricedReceipt[] {
  const set = new Set(pcs);
  return WORLD.pricedReceipts.filter((r) => r.postingDate.startsWith(month) && set.has(r.profitCentreId));
}

const ppvIn = (month: string, pcs: readonly string[]): number => receiptsIn(month, pcs).reduce((s, r) => s + ppvOf(r), 0);

// ---------------------------------------------------------------------------
// the bridge
// ---------------------------------------------------------------------------
const DEFINITIONS: Record<ComponentId, string> = {
  price: "Revenue from list-priced products: the change in the list price level times the volume sold",
  volume: "The rest of the revenue change, at the comparator's material margin (the material that goes with the volume is deducted)",
  "material-price": "Purchase price variance: quantity received times invoiced price less standard price, on the receipts that carry a price reference",
  "material-usage": "Material cost not explained by volume or price: usage, mix and purchases without a price reference",
  employee: "Change in employee benefits expense",
  depreciation: "Change in depreciation and amortisation",
  fx: "Exchange gains less exchange losses",
  "one-offs": "Liquidated damages, bad debts and liabilities written back",
  other: "Change in other expenses, excluding exchange losses and the one-off accounts",
};

const LABELS: Record<ComponentId, string> = {
  price: "Price", volume: "Volume", "material-price": "Material price", "material-usage": "Material usage and mix", employee: "Employee cost",
  depreciation: "Depreciation", fx: "Exchange differences", "one-offs": "One-offs", other: "Other expenses",
};

export function bridge(scope: Scope, month: string, comparator: Comparator): VarianceResult {
  const pcs = scopePcs(scope);
  const baseMonth = previousMonth(month);
  const current = plMonth(month, pcs);
  const base = comparator === "budget" ? budgetMonth(month, pcs) : plMonth(baseMonth, pcs);
  const ppvCurrent = ppvIn(month, pcs);
  const ppvBase = comparator === "budget" ? 0 : ppvIn(baseMonth, pcs);

  // price and volume, profit centre by profit centre: revenue = volume x price level
  let price = 0;
  for (const pc of pcs) {
    const cur = plMonth(month, [pc]);
    if (cur.pricedRevenue === 0) continue;
    const p1 = priceIndex(pc, month);
    const p0 = comparator === "budget" ? planPriceIndex(pc) : priceIndex(pc, baseMonth);
    price += cur.pricedRevenue * (1 - p0 / p1);
  }
  const volumeRevenue = current.revenue - base.revenue - price;
  const baseMaterialRatio = base.revenue === 0 ? 0 : base.material / base.revenue;
  const volumeMaterial = volumeRevenue * baseMaterialRatio;
  const ppvDelta = ppvCurrent - ppvBase;
  const materialUsage = -(current.material - base.material - volumeMaterial - ppvDelta);

  const effects: Record<ComponentId, number> = {
    price,
    volume: volumeRevenue - volumeMaterial,
    "material-price": -ppvDelta,
    "material-usage": materialUsage,
    employee: -(current.employee - base.employee),
    depreciation: -(current.depreciation - base.depreciation),
    fx: current.fxGain - base.fxGain - (current.fxLoss - base.fxLoss),
    "one-offs": current.oneOffIncome - base.oneOffIncome - (current.oneOffExpense - base.oneOffExpense),
    other: -(current.other - base.other),
  };
  const components = (Object.keys(effects) as ComponentId[]).map((id): BridgeComponent => ({ id, label: LABELS[id], effect: effects[id], definition: DEFINITIONS[id] }));

  const resultCurrent = operatingResult(current);
  const resultBase = operatingResult(base);
  const delta = resultCurrent - resultBase;
  const residual = components.reduce((s, c) => s + c.effect, 0) - delta;

  return {
    scope, month, comparator,
    baseLabel: comparator === "budget" ? "budget" : fmtMonth(`${baseMonth}-01`),
    current, base, resultCurrent, resultBase, delta, marginCurrent: margin(current), marginBase: margin(base),
    components, residual, ppv: { current: ppvCurrent, base: ppvBase },
    drivers: drivers(scope, month, comparator),
    priceNote: comparator === "budget" ? "against the price level the plan assumed" : "against the previous month's list price level",
  };
}

// ---------------------------------------------------------------------------
// the transactions behind the components
// ---------------------------------------------------------------------------
/** The identified transactions that moved the result, largest effect first. */
export function drivers(scope: Scope, month: string, comparator: Comparator, limit = 10): Driver[] {
  const pcs = scopePcs(scope);
  const set = new Set(pcs);
  const baseMonth = previousMonth(month);
  const out: Driver[] = [];

  const addReceipts = (m: string, sign: 1 | -1) => {
    for (const r of receiptsIn(m, pcs)) {
      const ppv = ppvOf(r);
      if (ppv === 0) continue;
      out.push({
        id: `ppv:${r.lineKey}`, kind: "material-price", month: m, profitCentreId: r.profitCentreId, wbs: r.wbs, lineKey: r.lineKey, docKey: r.docKey, vendorId: r.vendorId, po: r.po,
        title: `${r.material}, ${new Intl.NumberFormat("en-IN").format(r.quantity)} ${r.unit} at ${r.invoicePrice} against a standard of ${r.standardPrice}`,
        effect: -sign * ppv,
      });
    }
  };
  addReceipts(month, 1);
  if (comparator === "prior-month") addReceipts(baseMonth, -1);

  const addLines = (m: string, sign: 1 | -1) => {
    for (const l of WORLD.lines) {
      if (!l.postingDate.startsWith(m) || !set.has(l.profitCentre)) continue;
      const gl = l.gl;
      const oneOff = ONE_OFF_EXPENSE_GLS.includes(gl) || ONE_OFF_INCOME_GLS.includes(gl);
      const fx = gl === FX_LOSS_GL || gl === FX_GAIN_GL;
      if (!oneOff && !fx) continue;
      // income is a credit and expense a debit: either way the result moves by minus the signed amount
      const resultEffect = -l.amount;
      out.push({
        id: `${fx ? "fx" : "oo"}:${l.key}`, kind: fx ? "exchange" : "one-off", month: m, profitCentreId: l.profitCentre, wbs: l.wbs, lineKey: l.key, docKey: `${l.fiscalYear}-${l.docNo}`,
        title: `${GL_BY_ID.get(gl)?.description ?? gl}${l.text ? `, ${l.text}` : ""}`,
        effect: sign * resultEffect,
      });
    }
  };
  addLines(month, 1);
  if (comparator === "prior-month") addLines(baseMonth, -1);

  return out.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, limit);
}

export function projectNameOf(d: Driver): string | undefined {
  return d.wbs ? PROJECT_BY_WBS.get(d.wbs)?.name : undefined;
}

// ---------------------------------------------------------------------------
// the narrator
// ---------------------------------------------------------------------------
/** A commentary drafted from the bridge, to be edited and saved by the analyst. A template over facts: nothing is inferred. */
export function draftCommentary(r: VarianceResult): string {
  const who = scopeLabel(r.scope);
  const month = fmtMonth(`${r.month}-01`);
  const dir = r.delta === 0 ? "was unchanged" : r.delta > 0 ? "rose" : "fell";
  const mg = (m?: number) => (m === undefined ? "n/a" : `${(m * 100).toFixed(1)}%`);
  const lines: string[] = [];
  const against = r.comparator === "budget" ? "a budget of" : `${r.baseLabel} of`;
  lines.push(
    `${who} made an operating result of ${fmtINRCompact(r.resultCurrent)} in ${month} against ${against} ${fmtINRCompact(r.resultBase)}; it ${dir}${r.delta === 0 ? "" : ` by ${fmtINRCompact(Math.abs(r.delta))}`}, and the margin was ${mg(r.marginCurrent)} against ${mg(r.marginBase)}.`
  );
  const ranked = [...r.components].filter((c) => Math.abs(c.effect) >= 1).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const worst = ranked.filter((c) => c.effect < 0).slice(0, 2);
  const best = ranked.filter((c) => c.effect > 0).slice(0, 2);
  if (worst.length) lines.push(`The largest drags were ${worst.map((c) => `${c.label.toLowerCase()} (${fmtINRCompact(c.effect)})`).join(" and ")}.`);
  if (best.length) lines.push(`${worst.length ? "These were partly offset by" : "The largest gains were"} ${best.map((c) => `${c.label.toLowerCase()} (+${fmtINRCompact(c.effect)})`).join(" and ")}.`);
  const top = r.drivers[0];
  if (top) {
    const project = projectNameOf(top);
    lines.push(`The largest single item is ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}, ${fmtINRCompact(top.effect)} on the result${project ? `, on project ${project}` : ""}.`);
  }
  if (r.ppv.current !== r.ppv.base) lines.push(`Purchase price variance on priced receipts was ${fmtINRCompact(r.ppv.current)} against ${fmtINRCompact(r.ppv.base)}.`);
  return lines.join(" ");
}

export const canCompare = (month: string, comparator: Comparator): boolean => comparator !== "budget" || hasBudget(month);
