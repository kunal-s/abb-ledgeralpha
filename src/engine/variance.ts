// Variance analysis (docs/FRD.md §6.15, D-65): what moved the operating profit
// of a month against the month before, or against the same month a year
// earlier. Every profit and loss line of either month falls in exactly one
// component, so the components add up to the whole variance and nothing is
// hidden in a residual (FR-VAR-01); the residual is computed and shown, and it
// is nil by construction. Drivers are read from the ledger: revenue stream,
// materials, staff, each expense account and one-off entries. Price and volume
// need quantities, which the extract does not carry.

import type { IsoDate, LineItem } from "@/types";
import { GL_BY_ID, PARTY_BY_ID, PC_BY_ID, WORLD } from "@/data";
import { addDays, monthEnd } from "@/lib/dates";
import { fmtINRCompact, fmtPct } from "@/lib/format";

export type Base = "prior-month" | "prior-year";

export const VARIANCE_POLICY = {
  /** a manual journal at least this large on a profit and loss account is a one-off when the account has none like it in the other month */
  oneOffAmount: 25_00_000,
  /** expense accounts beyond this many biggest movers are shown together */
  expenseAccountsShown: 4,
} as const;

const OPERATING: Record<string, "revenue" | "materials" | "employee" | "depreciation" | "expense"> = {
  "Revenue from operations": "revenue",
  "Cost of materials consumed": "materials",
  "Purchases of stock-in-trade": "materials",
  "Changes in inventories": "materials",
  "Employee benefits expense": "employee",
  "Depreciation and amortisation expense": "depreciation",
  "Other expenses": "expense",
};

const kindOfGl = new Map<string, "revenue" | "materials" | "employee" | "depreciation" | "expense">();
for (const g of WORLD.glAccounts) if (g.category === "pl" && OPERATING[g.statementLine]) kindOfGl.set(g.gl, OPERATING[g.statementLine]);

export interface Window {
  from: IsoDate;
  to: IsoDate;
}

export function windows(periodEnd: IsoDate, base: Base): { current: Window; prior: Window } {
  const first = (end: IsoDate) => `${end.slice(0, 8)}01`;
  const current = { from: first(periodEnd), to: periodEnd };
  const priorEnd = base === "prior-month" ? addDays(first(periodEnd), -1) : monthEnd(`${Number(periodEnd.slice(0, 4)) - 1}${periodEnd.slice(4, 8)}01`);
  return { current, prior: { from: first(priorEnd), to: priorEnd } };
}

export interface Component {
  id: string;
  label: string;
  kind: "revenue" | "cost" | "one-off";
  current: number;
  prior: number;
  /** the change in operating profit this component accounts for */
  effect: number;
  lines: number;
}

export interface Bridge {
  periodEnd: IsoDate;
  current: Window;
  prior: Window;
  priorProfit: number;
  currentProfit: number;
  total: number;
  components: Component[];
  /** the variance the components do not account for: nil, shown so it cannot hide */
  residual: number;
}

const isBigManual = (l: LineItem) => l.manual && Math.abs(l.amount) >= VARIANCE_POLICY.oneOffAmount;

/** Accounts with a large manual journal in a month: one that repeats in the other month is routine, not a one-off. */
function bigManualAccounts(w: Window): Set<string> {
  const s = new Set<string>();
  for (const l of WORLD.lines) if (inWin(l, w) && kindOfGl.has(l.gl) && isBigManual(l)) s.add(l.gl);
  return s;
}

type Classify = (l: LineItem, inCurrent: boolean) => { id: string; label: string; kind: Component["kind"] } | undefined;

function classifier(current: Window, prior: Window): Classify {
  const cur = bigManualAccounts(current);
  const pri = bigManualAccounts(prior);
  return (l, inCurrent) => componentOf(l, isBigManual(l) && !(inCurrent ? pri : cur).has(l.gl));
}

function componentOf(l: LineItem, oneOff: boolean): { id: string; label: string; kind: Component["kind"] } | undefined {
  const k = kindOfGl.get(l.gl);
  if (!k) return undefined;
  if (oneOff) return { id: "one-offs", label: "One-off entries", kind: "one-off" };
  if (k === "revenue") return { id: `rev:${l.gl}`, label: GL_BY_ID.get(l.gl)?.description ?? l.gl, kind: "revenue" };
  if (k === "materials") return { id: "materials", label: "Materials", kind: "cost" };
  if (k === "employee") return { id: "employee", label: "Employees", kind: "cost" };
  if (k === "depreciation") return { id: "depreciation", label: "Depreciation", kind: "cost" };
  return { id: `exp:${l.gl}`, label: GL_BY_ID.get(l.gl)?.description ?? l.gl, kind: "cost" };
}

function inWin(l: LineItem, w: Window) {
  return l.postingDate >= w.from && l.postingDate <= w.to;
}
const inBu = (l: LineItem, bu: string) => bu === "all" || (PC_BY_ID.get(l.profitCentre)?.businessUnitId ?? "CORP") === bu;

export function varianceBridge(periodEnd: IsoDate, base: Base = "prior-month", businessUnitId = "all"): Bridge {
  const { current, prior } = windows(periodEnd, base);
  const classify = classifier(current, prior);
  const map = new Map<string, Component>();
  let currentProfit = 0;
  let priorProfit = 0;
  for (const l of WORLD.lines) {
    const inCur = inWin(l, current);
    const inPri = !inCur && inWin(l, prior);
    if (!inCur && !inPri) continue;
    if (!inBu(l, businessUnitId)) continue;
    const c = classify(l, inCur);
    if (!c) continue;
    const e = map.get(c.id) ?? { ...c, current: 0, prior: 0, effect: 0, lines: 0 };
    // profit rises with a credit on revenue and falls with a debit on cost: the contribution is the line with its sign reversed
    if (inCur) {
      e.current -= l.amount;
      currentProfit -= l.amount;
    } else {
      e.prior -= l.amount;
      priorProfit -= l.amount;
    }
    e.lines += 1;
    map.set(c.id, e);
  }
  let comps = [...map.values()].map((c) => ({ ...c, effect: c.current - c.prior }));
  // expense accounts: the biggest movers on their own, the rest together
  const accounts = comps.filter((c) => c.id.startsWith("exp:")).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const rest = accounts.slice(VARIANCE_POLICY.expenseAccountsShown);
  if (rest.length > 1) {
    const merged: Component = { id: "exp:other", label: `Other expenses, ${rest.length} accounts`, kind: "cost", current: 0, prior: 0, effect: 0, lines: 0 };
    for (const r of rest) {
      merged.current += r.current;
      merged.prior += r.prior;
      merged.effect += r.effect;
      merged.lines += r.lines;
    }
    comps = [...comps.filter((c) => !rest.includes(c)), merged];
  }
  comps.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  const total = currentProfit - priorProfit;
  return { periodEnd, current, prior, priorProfit, currentProfit, total, components: comps, residual: total - comps.reduce((s, c) => s + c.effect, 0) };
}

export interface Driver {
  line: LineItem;
  docKey: string;
  party?: string;
  /** the line's contribution to operating profit */
  impact: number;
  /** nothing like it posted in the earlier month on this account */
  newThisPeriod: boolean;
}

/** The largest postings of the period in a component: what is in the number. */
export function driversOf(periodEnd: IsoDate, base: Base, componentId: string, businessUnitId = "all", limit = 10): Driver[] {
  const { current, prior } = windows(periodEnd, base);
  const classify = classifier(current, prior);
  const seen = new Set<string>();
  for (const l of WORLD.lines) if (inWin(l, prior) && kindOfGl.has(l.gl)) seen.add(l.gl);
  const out: Driver[] = [];
  for (const l of WORLD.lines) {
    if (!inWin(l, current) || !inBu(l, businessUnitId)) continue;
    const c = classify(l, true);
    if (!c) continue;
    const match = componentId === "exp:other" ? c.id.startsWith("exp:") : c.id === componentId;
    if (!match) continue;
    out.push({ line: l, docKey: `${l.fiscalYear}-${l.docNo}`, party: l.partner ? PARTY_BY_ID.get(l.partner.id)?.name : undefined, impact: -l.amount, newThisPeriod: !seen.has(l.gl) });
  }
  return out.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact)).slice(0, limit);
}

const money = (n: number) => `${n >= 0 ? "+" : "-"}${fmtINRCompact(Math.abs(n))}`;
const shortLabel = (label: string) => label.toLowerCase().replace(/^revenue - /, "");

/** A reading of the movement drafted from the bridge (decision D-04: a template, not a live model). */
export function draftVarianceCommentary(b: Bridge, base: Base): string {
  const against = base === "prior-month" ? "the month before" : "the same month last year";
  const up = b.total >= 0;
  const pctChange = b.priorProfit ? Math.abs(b.total / b.priorProfit) : 0;
  const parts = [`Operating profit ${up ? "rose" : "fell"} ${fmtINRCompact(Math.abs(b.total))} (${fmtPct(pctChange)}) to ${fmtINRCompact(b.currentProfit)} against ${against}.`];
  const revenue = b.components.filter((c) => c.kind === "revenue").sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
  const revenueEffect = revenue.reduce((s, c) => s + c.effect, 0);
  if (revenue.length) {
    const lead = revenue.slice(0, 2).map((c) => `${shortLabel(c.label)} ${money(c.effect)}`).join(", ");
    parts.push(`Revenue ${revenueEffect >= 0 ? "added" : "took"} ${fmtINRCompact(Math.abs(revenueEffect))} ${revenueEffect >= 0 ? "to" : "from"} profit: ${lead}.`);
  }
  const costs = b.components.filter((c) => c.kind === "cost").sort((x, y) => Math.abs(y.effect) - Math.abs(x.effect));
  const costEffect = costs.reduce((s, c) => s + c.effect, 0);
  if (costs.length) {
    const lead = costs.slice(0, 2).map((c) => `${c.label.toLowerCase()} ${money(c.effect)}`).join(", ");
    parts.push(`Costs ${costEffect >= 0 ? "added" : "took"} ${fmtINRCompact(Math.abs(costEffect))} ${costEffect >= 0 ? "to" : "from"} profit: ${lead}.`);
  }
  const oneOff = b.components.find((c) => c.kind === "one-off");
  if (oneOff) parts.push(`${oneOff.lines} one-off ${oneOff.lines === 1 ? "entry" : "entries"} moved profit by ${fmtINRCompact(Math.abs(oneOff.effect))}.`);
  if (Math.abs(b.residual) > 0.5) parts.push(`${fmtINRCompact(Math.abs(b.residual))} is not accounted for.`);
  return parts.join(" ");
}
