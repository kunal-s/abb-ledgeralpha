// Rule Studio (docs/FRD.md §6.20, D-52): a controller describes a rule in plain
// words; a deterministic parser turns it into a structured rule (scope,
// conditions, action), the rule is backtested on the loaded ledger, and an
// accepted rule joins the library and runs like any other. Nothing here calls a
// model: the same sentence always gives the same rule, and a rule always gives
// the same hits. The draft is a judgement until a person accepts it.

import type { AccountCategory, ActionKind, LineItem, RuleDefinition, RuleHit, RuleParam, Severity } from "@/types";
import { ageOf } from "@/engine/review";
import { daysBetween, fmtDate } from "@/lib/dates";
import { fmtINRCompact } from "@/lib/format";
import { CATEGORY_LABELS } from "@/lib/labels";
import { latestUpTo, type EvalContext } from "@/engine/context";
import type { Evaluator } from "@/engine/rules/bsr";
import type { RuleRun } from "@/engine/run";

// ---------------------------------------------------------------------------
// The structured rule
// ---------------------------------------------------------------------------
export type Condition =
  | { kind: "age-over"; days: number }
  | { kind: "amount-over"; amount: number }
  | { kind: "no-po-activity"; days: number }
  | { kind: "po-closed" }
  | { kind: "partner-status"; status: "Blocked" | "Inactive" }
  | { kind: "manual-entry" };

export interface StudioRule {
  id: string;
  name: string;
  /** the sentence it was drafted from */
  source: string;
  categories: AccountCategory[] | "all";
  conditions: Condition[];
  action: ActionKind;
  severity: Severity;
}

export const STUDIO_PREFIX = "CUS-";
export const isStudioRuleId = (id: string) => id.startsWith(STUDIO_PREFIX);

export interface ParseResult {
  rule: Omit<StudioRule, "id">;
  /** what the parser understood, in the order it appears in the sentence */
  understood: string[];
  /** things a person should check before accepting */
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------
/** Longer phrases first, so "tds receivable" is read before "receivable". */
const CATEGORY_WORDS: [AccountCategory, string[]][] = [
  ["tds-recv", ["tds receivable", "tax deducted at source receivable", "withholding tax receivable", "tds credit", "tds"]],
  ["grir", ["gr/ir", "grir", "gr ir", "goods received not invoiced", "goods receipt", "goods received"]],
  ["vendor-adv", ["vendor advances", "vendor advance", "supplier advances", "supplier advance", "advances to vendors", "advances to suppliers", "advance to vendors"]],
  ["customer-adv", ["customer advances", "customer advance", "advances from customers", "advance from customers"]],
  ["employee-adv", ["employee advances", "employee advance", "staff advances"]],
  ["unbilled", ["unbilled revenue", "unbilled"]],
  ["retention", ["retention receivable", "retention money", "retention"]],
  ["suspense", ["suspense", "clearing accounts", "clearing"]],
  ["statutory-dues", ["statutory dues"]],
  ["intercompany", ["intercompany", "inter-company", "group company"]],
  ["deposits", ["deposits"]],
  ["cwip", ["capital work in progress", "cwip"]],
  ["trade-recv", ["trade receivables", "trade receivable", "receivables", "receivable", "debtors"]],
  ["trade-pay", ["trade payables", "trade payable", "payables", "payable", "creditors"]],
  ["gst", ["gst input", "gst credit", "gst"]],
];

const ACTION_WORDS: [ActionKind, RegExp][] = [
  ["Write back", /\bwrite[- ]?back\b/],
  ["Write off", /\bwrite[- ]?off\b/],
  ["Provide", /\b(provide|provision|provisioning)\b/],
  ["Reclassify", /\breclassif(y|ication)\b/],
  ["Clear", /\bclear(ing)?\b/],
  ["Escalate", /\bescalat(e|ion)\b/],
  ["Follow up", /\b(follow[- ]?up|chase)\b/],
];

const UNIT_DAYS: Record<string, number> = { day: 1, days: 1, week: 7, weeks: 7, month: 30, months: 30, year: 365, years: 365 };
const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, nine: 9, twelve: 12, eighteen: 18 };

function numberOf(s: string): number {
  const w = WORD_NUMBERS[s.toLowerCase()];
  return w ?? Number(s.replace(/,/g, ""));
}

const MONEY_UNIT: Record<string, number> = { crore: 1_00_00_000, crores: 1_00_00_000, cr: 1_00_00_000, lakh: 1_00_000, lakhs: 1_00_000, lac: 1_00_000, lacs: 1_00_000, thousand: 1_000, k: 1_000 };

/** Reads a sentence such as "vendor advances over a year with no PO activity" into a structured rule. */
export function parseRuleText(text: string): ParseResult {
  const original = text.trim();
  let rest = ` ${original.toLowerCase().replace(/₹/g, " ₹ ").replace(/\s+/g, " ")} `;
  const understood: string[] = [];
  const warnings: string[] = [];
  const conditions: Condition[] = [];

  // categories (longest phrase wins, and a phrase is removed once read)
  const categories: AccountCategory[] = [];
  const found: { cat: AccountCategory; word: string; at: number }[] = [];
  for (const [cat, words] of CATEGORY_WORDS) {
    for (const w of [...words].sort((a, b) => b.length - a.length)) {
      const i = rest.indexOf(w);
      if (i >= 0 && /[^a-z]/.test(rest[i - 1] ?? " ") && /[^a-z]/.test(rest[i + w.length] ?? " ")) {
        found.push({ cat, word: w, at: i });
        rest = rest.slice(0, i) + " ".repeat(w.length) + rest.slice(i + w.length);
        break;
      }
    }
  }
  for (const f of found.sort((a, b) => a.at - b.at)) {
    if (!categories.includes(f.cat)) categories.push(f.cat);
  }
  if (categories.length) understood.push(categories.map((c) => CATEGORY_LABELS[c]).join(", "));
  else warnings.push("No balance sheet area was named, so the rule looks at every open-item account");

  // PO activity and closed orders (read before the age so "no PO activity for 180 days" is not an age)
  const noPo = rest.match(/\bno (?:recent )?(?:po|purchase order)(?: or (?:grn|gr|invoice))? (?:activity|movement)(?: (?:for|in|over|since|within)(?: the (?:last|past))? (an?|\d+|one|two|three|four|five|six|nine|twelve|eighteen) (days?|weeks?|months?|years?))?/);
  if (noPo) {
    const days = noPo[1] ? Math.round(numberOf(noPo[1]) * UNIT_DAYS[noPo[2]]) : 180;
    conditions.push({ kind: "no-po-activity", days });
    understood.push(`No purchase order activity for ${days} days`);
    rest = rest.replace(noPo[0], " ");
  }
  const poClosed = rest.match(/\b(?:po|purchase order|order) (?:is |was )?(?:closed|deleted|flagged for deletion)\b/);
  if (poClosed) {
    conditions.push({ kind: "po-closed" });
    understood.push("Purchase order closed");
    rest = rest.replace(poClosed[0], " ");
  }

  // partner status
  const blocked = rest.match(/\b(?:blocked|block)\b/);
  const inactive = rest.match(/\binactive\b/);
  if (blocked) {
    conditions.push({ kind: "partner-status", status: "Blocked" });
    understood.push("Business partner blocked");
    rest = rest.replace(blocked[0], " ");
  } else if (inactive) {
    conditions.push({ kind: "partner-status", status: "Inactive" });
    understood.push("Business partner inactive");
    rest = rest.replace(inactive[0], " ");
  }

  // manual entries
  const manual = rest.match(/\bmanual(?:ly)?(?: (?:entr(?:y|ies)|journals?|postings?|entered))?\b/);
  if (manual) {
    conditions.push({ kind: "manual-entry" });
    understood.push("Entered manually");
    rest = rest.replace(manual[0], " ");
  }

  // age: "older than 365 days", "over a year", "more than 6 months", "365+ days"
  const age = rest.match(/\b(?:older than|over|more than|above|beyond|greater than|exceeding|aged)\s*(an?|\d+|one|two|three|four|five|six|nine|twelve|eighteen)\s*(days?|weeks?|months?|years?)\b/) ?? rest.match(/\b(\d+)\s*\+\s*(days?|months?|years?)\b/);
  if (age) {
    const days = Math.round(numberOf(age[1]) * UNIT_DAYS[age[2]]);
    conditions.push({ kind: "age-over", days });
    understood.push(`Older than ${days} days`);
    rest = rest.replace(age[0], " ");
  }

  // amount: "above ₹10 lakh", "over 1 crore", "of at least 50,00,000"
  const amount = rest.match(/\b(?:above|over|more than|exceeding|greater than|at least|of at least|worth more than)\s*₹?\s*([\d,]+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|thousand|k)?\b/);
  if (amount) {
    const value = Number(amount[1].replace(/,/g, "")) * (amount[2] ? MONEY_UNIT[amount[2]] : 1);
    if (Number.isFinite(value) && value > 0 && (amount[2] || value >= 1000)) {
      conditions.push({ kind: "amount-over", amount: value });
      understood.push(`Amount of ${fmtINRCompact(value)} or more`);
    }
  }

  // action
  let action: ActionKind = "Follow up";
  const lead = original.toLowerCase().match(/\b(?:recommend|propose|suggest|then|and|to)\s+([a-z\- ]{3,20})$/);
  const sentence = lead ? lead[1] : "";
  // "clearing" is also the name of an account group, so a bare "clear" is only read as an action in the closing phrase
  const hit = ACTION_WORDS.find(([, re]) => re.test(sentence)) ?? ACTION_WORDS.filter(([a]) => a !== "Clear").find(([, re]) => re.test(original.toLowerCase()));
  if (hit) action = hit[0];
  else warnings.push("No action was named, so the rule recommends a follow-up");
  understood.push(`Recommends ${action.toLowerCase()}`);

  const ORDER: Condition["kind"][] = ["age-over", "amount-over", "no-po-activity", "po-closed", "partner-status", "manual-entry"];
  conditions.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
  if (!conditions.length) warnings.push("No condition was recognised: the rule would flag every item in scope");
  if (conditions.length && !conditions.some((c) => c.kind === "age-over") && !conditions.some((c) => c.kind === "no-po-activity")) warnings.push("The rule has no age condition, so it flags old and new items alike");

  const severity: Severity = conditions.some((c) => c.kind === "amount-over" && c.amount >= 1_00_00_000) ? "high" : action === "Write off" || action === "Write back" ? "high" : "medium";
  const scopeText = categories.length ? categories.map((c) => CATEGORY_LABELS[c]).join(" and ") : "Open items";
  const parts = conditions.map(conditionText);
  const name = `${scopeText}${parts.length ? ", " + parts.join(", ") : ""}`.replace(/^./, (c) => c.toUpperCase());

  return { rule: { name: name.length > 80 ? `${name.slice(0, 77)}...` : name, source: original, categories: categories.length ? categories : "all", conditions, action, severity }, understood, warnings };
}

export function conditionText(c: Condition): string {
  switch (c.kind) {
    case "age-over": return `older than ${c.days} days`;
    case "amount-over": return `${fmtINRCompact(c.amount)} or more`;
    case "no-po-activity": return `no purchase order activity for ${c.days} days`;
    case "po-closed": return "purchase order closed";
    case "partner-status": return `business partner ${c.status.toLowerCase()}`;
    case "manual-entry": return "entered manually";
  }
}

// ---------------------------------------------------------------------------
// Definition and evaluator: the rule as the engine runs it
// ---------------------------------------------------------------------------
const PARAM_OF = {
  "age-over": { key: "ageDays", label: "Older than", unit: "days" as const },
  "amount-over": { key: "minAmount", label: "Amount at least", unit: "amount" as const },
  "no-po-activity": { key: "poIdleDays", label: "No PO activity for", unit: "days" as const },
};

export function definitionOf(rule: StudioRule): RuleDefinition {
  const params: RuleParam[] = [];
  for (const c of rule.conditions) {
    if (c.kind === "age-over") params.push({ ...PARAM_OF["age-over"], value: c.days });
    if (c.kind === "amount-over") params.push({ ...PARAM_OF["amount-over"], value: c.amount });
    if (c.kind === "no-po-activity") params.push({ ...PARAM_OF["no-po-activity"], value: c.days });
  }
  return {
    id: rule.id,
    module: "balance-sheet-review",
    name: rule.name,
    scope: rule.categories === "all" ? "Open items on every open-item account" : `Open items on ${rule.categories.map((c) => CATEGORY_LABELS[c].toLowerCase()).join(" and ")}`,
    logic: rule.conditions.length ? rule.conditions.map(conditionText).join(" and ") : "Every item in scope",
    categories: rule.categories,
    severity: rule.severity,
    candidateAction: rule.action,
    params,
    basis: `Configured in Rule Studio from: "${rule.source}"`,
    enabledByDefault: true,
    custom: true,
  };
}

interface Facts {
  age: number;
  idle?: number;
}

/** Whether one open item meets every condition; thresholds come from the parameters, so a controller can tune them. */
function meets(ctx: EvalContext, l: LineItem, rule: StudioRule, p: Record<string, number>): { ok: boolean; why: string[]; facts: Facts } {
  const why: string[] = [];
  const a = ageOf(l, ctx.asOf);
  const facts: Facts = { age: a };
  for (const c of rule.conditions) {
    switch (c.kind) {
      case "age-over":
        if (!(a > (p.ageDays ?? c.days))) return { ok: false, why, facts };
        break;
      case "amount-over":
        if (!(Math.abs(l.amount) >= (p.minAmount ?? c.amount))) return { ok: false, why, facts };
        break;
      case "no-po-activity": {
        const limit = p.poIdleDays ?? c.days;
        const ps = l.po ? ctx.po.get(`${l.po.number}/${l.po.item}`) : undefined;
        const last = ps ? latestUpTo(ctx.asOf, ps.lastGrDate, ps.lastInvoiceDate) ?? l.postingDate : l.postingDate;
        const idle = daysBetween(last, ctx.asOf);
        facts.idle = idle;
        if (!(idle > limit)) return { ok: false, why, facts };
        why.push(l.po ? `no activity on PO ${l.po.number} for ${idle} days` : `no purchase order activity for ${idle} days`);
        break;
      }
      case "po-closed": {
        const ps = l.po ? ctx.po.get(`${l.po.number}/${l.po.item}`) : undefined;
        if (!ps || ps.status === "Open") return { ok: false, why, facts };
        why.push(`PO ${ps.po} ${ps.status.toLowerCase()}`);
        break;
      }
      case "partner-status": {
        const party = l.partner ? ctx.party.get(l.partner.id) : undefined;
        if (!party || party.status !== c.status) return { ok: false, why, facts };
        why.push(`${party.type.toLowerCase()} ${c.status.toLowerCase()}`);
        break;
      }
      case "manual-entry":
        if (!l.manual) return { ok: false, why, facts };
        why.push("entered manually");
        break;
    }
  }
  return { ok: true, why, facts };
}

export function evaluatorOf(rule: StudioRule): Evaluator {
  return (ctx, p) => {
    const hits: RuleHit[] = [];
    for (const l of ctx.open) {
      const cat = ctx.gl.get(l.gl)!.category;
      if (rule.categories !== "all" && !rule.categories.includes(cat)) continue;
      const m = meets(ctx, l, rule, p);
      if (!m.ok) continue;
      hits.push({
        ruleId: rule.id,
        itemKey: l.key,
        reason: `Open ${m.facts.age} days since ${fmtDate(l.postingDate)}${m.why.length ? `; ${m.why.join("; ")}` : ""}`,
        facts: { amount: l.amount, ageDays: m.facts.age, ...(m.facts.idle !== undefined ? { poIdleDays: m.facts.idle } : {}) },
      });
    }
    return hits;
  };
}

// ---------------------------------------------------------------------------
// Backtest on the loaded ledger
// ---------------------------------------------------------------------------
export interface BacktestRow {
  key: string;
  line: LineItem;
  reason: string;
  /** rules that already flag the item */
  existing: string[];
}

export interface Backtest {
  count: number;
  value: number;
  /** items no rule flags today */
  fresh: { count: number; value: number };
  /** items another rule already flags, by rule */
  overlap: { ruleId: string; count: number }[];
  byCategory: { category: AccountCategory; count: number; value: number }[];
  rows: BacktestRow[];
}

/** Runs the draft over the open items of the run's period, against the rules already flagging them. */
export function backtest(rule: StudioRule, run: RuleRun): Backtest {
  const params = Object.fromEntries(definitionOf(rule).params.map((p) => [p.key, p.value]));
  const hits = evaluatorOf(rule)(run.ctx, params);
  const overlap = new Map<string, number>();
  const byCat = new Map<AccountCategory, { count: number; value: number }>();
  const rows: BacktestRow[] = [];
  let value = 0;
  let fresh = { count: 0, value: 0 };
  for (const h of hits) {
    const line = run.ctx.open.find((l) => l.key === h.itemKey)!;
    const existing = (run.byItem.get(h.itemKey) ?? []).filter((x) => x.ruleId !== rule.id).map((x) => x.ruleId);
    const amt = Math.abs(line.amount);
    value += amt;
    if (!existing.length) fresh = { count: fresh.count + 1, value: fresh.value + amt };
    for (const id of new Set(existing)) overlap.set(id, (overlap.get(id) ?? 0) + 1);
    const c = run.ctx.gl.get(line.gl)!.category;
    const e = byCat.get(c) ?? { count: 0, value: 0 };
    byCat.set(c, { count: e.count + 1, value: e.value + amt });
    rows.push({ key: h.itemKey, line, reason: h.reason, existing: [...new Set(existing)] });
  }
  rows.sort((a, b) => Math.abs(b.line.amount) - Math.abs(a.line.amount));
  return {
    count: hits.length,
    value,
    fresh,
    overlap: [...overlap.entries()].map(([ruleId, count]) => ({ ruleId, count })).sort((a, b) => b.count - a.count),
    byCategory: [...byCat.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.value - a.value),
    rows,
  };
}

// ---------------------------------------------------------------------------
// Suggestions: patterns the library does not cover
// ---------------------------------------------------------------------------
export interface Suggestion {
  text: string;
  /** why it is worth looking at, from the backtest */
  evidence: string;
  fresh: { count: number; value: number };
  count: number;
}

const SUGGESTION_MIN_NEW = 3;

const TEMPLATES: { text: (cat?: string) => string; categories?: AccountCategory[] }[] = [
  { text: (c) => `${c} over 180 days where the business partner is blocked, recommend provide`, categories: ["vendor-adv", "customer-adv", "trade-pay", "trade-recv", "deposits"] },
  { text: (c) => `${c} over 365 days above 25 lakh with no PO activity, recommend escalate`, categories: ["vendor-adv", "grir"] },
  { text: (c) => `${c} manual entries over 90 days, recommend follow up`, categories: ["suspense", "other-payables", "intercompany", "retention", "unbilled"] },
  { text: (c) => `${c} over 365 days where the business partner is inactive, recommend write off`, categories: ["trade-recv", "vendor-adv", "customer-adv", "retention", "unbilled", "deposits"] },
  { text: (c) => `${c} over 270 days above 10 lakh, recommend follow up`, categories: ["unbilled", "retention", "tds-recv", "customer-adv"] },
];

/** Candidate rules over the focus areas, each backtested; those that would flag items nothing flags today are suggested. */
export function suggestRules(run: RuleRun): Suggestion[] {
  const out: Suggestion[] = [];
  const seen = new Set<string>();
  for (const t of TEMPLATES) {
    for (const cat of t.categories ?? []) {
      const text = t.text(CATEGORY_LABELS[cat].toLowerCase());
      if (seen.has(text)) continue;
      seen.add(text);
      const parsed = parseRuleText(text);
      const bt = backtest({ id: `${STUDIO_PREFIX}00`, ...parsed.rule }, run);
      if (bt.fresh.count < SUGGESTION_MIN_NEW) continue;
      out.push({
        text,
        evidence: `${bt.fresh.count} items worth ${fmtINRCompact(bt.fresh.value)} that no rule flags today`,
        fresh: bt.fresh,
        count: bt.count,
      });
    }
  }
  return out.sort((a, b) => b.fresh.value - a.fresh.value).slice(0, 4);
}

/** The next free rule number, such as CUS-01. */
export function nextStudioId(existing: string[]): string {
  const n = existing.filter(isStudioRuleId).map((id) => Number(id.slice(STUDIO_PREFIX.length))).filter(Number.isFinite);
  return `${STUDIO_PREFIX}${String((n.length ? Math.max(...n) : 0) + 1).padStart(2, "0")}`;
}
