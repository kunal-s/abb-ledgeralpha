// Rule runs: apply workspace overrides to the product rule library, evaluate
// every enabled rule against the context, and index the hits by item and rule.

import type { EffectiveRule, IsoDate, LineItem, RuleDefinition, RuleHit } from "@/types";
import { buildContext, type EvalContext } from "@/engine/context";
import { BSR_EVALUATORS, BSR_RULES, type Evaluator } from "@/engine/rules/bsr";

export const PRODUCT_RULES: RuleDefinition[] = [...BSR_RULES];
const EVALUATORS: Record<string, Evaluator> = { ...BSR_EVALUATORS };

/** A rule configured in the workspace joins the library until it is removed. */
export function registerRule(def: RuleDefinition, evaluator: Evaluator): void {
  const i = PRODUCT_RULES.findIndex((r) => r.id === def.id);
  if (i >= 0) PRODUCT_RULES[i] = def;
  else PRODUCT_RULES.push(def);
  EVALUATORS[def.id] = evaluator;
}

export function unregisterRule(id: string): void {
  const i = PRODUCT_RULES.findIndex((r) => r.id === id && r.custom);
  if (i >= 0) PRODUCT_RULES.splice(i, 1);
  delete EVALUATORS[id];
}

export interface RuleOverride {
  enabled?: boolean;
  params?: Record<string, number>;
}
export type RuleOverrides = Record<string, RuleOverride>;

export function effectiveRules(overrides: RuleOverrides): EffectiveRule[] {
  return PRODUCT_RULES.map((r) => {
    const o = overrides[r.id] ?? {};
    const params = r.params.map((p) => ({ ...p, value: o.params?.[p.key] ?? p.value }));
    const enabled = o.enabled ?? r.enabledByDefault;
    const changed = enabled !== r.enabledByDefault || params.some((p, i) => p.value !== r.params[i].value);
    return { ...r, params, enabled, changed };
  });
}

/** Short, stable fingerprint of the rule configuration (recorded on decisions). */
export function rulesVersion(rules: EffectiveRule[]): string {
  const s = JSON.stringify(rules.map((r) => [r.id, r.enabled, r.params.map((p) => p.value)]));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return `rules@${h.toString(16).padStart(8, "0")}`;
}

export interface RuleStat {
  count: number;
  value: number;
}

export interface RuleRun {
  asOf: IsoDate;
  ctx: EvalContext;
  rules: EffectiveRule[];
  version: string;
  hits: RuleHit[];
  byItem: Map<string, RuleHit[]>;
  byRule: Map<string, RuleStat>;
  /** flagged line items by key */
  items: Map<string, LineItem>;
  flaggedValue: number;
  durationMs: number;
}

export function runRules(asOf: IsoDate, rules: EffectiveRule[]): RuleRun {
  const t0 = performance.now();
  const ctx = buildContext(asOf);
  const lineByKey = new Map<string, LineItem>();
  for (const l of ctx.open) lineByKey.set(l.key, l);
  for (const l of ctx.reviewLines) lineByKey.set(l.key, l);

  const hits: RuleHit[] = [];
  const byRule = new Map<string, RuleStat>();
  for (const r of rules) {
    if (!r.enabled) {
      byRule.set(r.id, { count: 0, value: 0 });
      continue;
    }
    const params = Object.fromEntries(r.params.map((p) => [p.key, p.value]));
    const ruleHits = EVALUATORS[r.id](ctx, params);
    hits.push(...ruleHits);
    byRule.set(r.id, {
      count: ruleHits.length,
      value: ruleHits.reduce((s, h) => s + Math.abs(lineByKey.get(h.itemKey)?.amount ?? 0), 0),
    });
  }
  const byItem = new Map<string, RuleHit[]>();
  const items = new Map<string, LineItem>();
  for (const h of hits) {
    byItem.set(h.itemKey, [...(byItem.get(h.itemKey) ?? []), h]);
    items.set(h.itemKey, lineByKey.get(h.itemKey)!);
  }
  const flaggedValue = [...items.values()].reduce((s, l) => s + Math.abs(l.amount), 0);
  return { asOf, ctx, rules, version: rulesVersion(rules), hits, byItem, byRule, items, flaggedValue, durationMs: performance.now() - t0 };
}
