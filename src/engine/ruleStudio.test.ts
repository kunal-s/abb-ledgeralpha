import { beforeEach, describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { ageOf } from "@/engine/review";
import { backtest, definitionOf, evaluatorOf, nextStudioId, parseRuleText, suggestRules, type StudioRule } from "@/engine/ruleStudio";
import { getRun } from "@/state/hooks";
import { modelsAt } from "@/test/models";
import { useRoleStore } from "@/lib/stores";
import { useWorkflow } from "@/state/workflow";

const wf = () => useWorkflow.getState();
const as = (role: "controller" | "external-auditor" | "head-of-finance") => useRoleStore.setState({ role });
const rule = (text: string): StudioRule => ({ id: "CUS-99", ...parseRuleText(text).rule });
const run = () => getRun(WORLD.asOf, wf().ruleOverrides);

beforeEach(() => {
  wf().resetDemo();
  as("controller");
});

describe("reading a sentence", () => {
  it("reads a scope, an age and a purchase order condition", () => {
    const p = parseRuleText("Vendor advances older than 365 days with no PO activity");
    expect(p.rule.categories).toEqual(["vendor-adv"]);
    expect(p.rule.conditions).toEqual([{ kind: "age-over", days: 365 }, { kind: "no-po-activity", days: 180 }]);
    expect(p.rule.action).toBe("Follow up");
    expect(p.warnings).toEqual(["No action was named, so the rule recommends a follow-up"]);
  });

  it("reads a year, a period of idleness and an action", () => {
    const p = parseRuleText("Vendor advances over a year with no PO activity for 6 months, recommend provide");
    expect(p.rule.conditions).toEqual([{ kind: "age-over", days: 365 }, { kind: "no-po-activity", days: 180 }]);
    expect(p.rule.action).toBe("Provide");
  });

  it("reads a closed order and a write-back", () => {
    const p = parseRuleText("GR/IR over 180 days where the PO is closed, write back");
    expect(p.rule.categories).toEqual(["grir"]);
    expect(p.rule.conditions).toEqual([{ kind: "age-over", days: 180 }, { kind: "po-closed" }]);
    expect(p.rule.action).toBe("Write back");
  });

  it("reads amounts in lakh and crore, and years as days", () => {
    const a = parseRuleText("retention above ₹10 lakh older than 2 years and escalate").rule;
    expect(a.conditions).toEqual([{ kind: "age-over", days: 730 }, { kind: "amount-over", amount: 10_00_000 }]);
    expect(a.action).toBe("Escalate");
    expect(parseRuleText("unbilled revenue over 90 days above 1.5 crore").rule.conditions).toContainEqual({ kind: "amount-over", amount: 1_50_00_000 });
  });

  it("does not take a day count for an amount", () => {
    const c = parseRuleText("customer advances over 365 days").rule.conditions;
    expect(c).toEqual([{ kind: "age-over", days: 365 }]);
  });

  it("reads TDS receivable as one area, not as receivables", () => {
    expect(parseRuleText("TDS receivable over 3 years").rule.categories).toEqual(["tds-recv"]);
    expect(parseRuleText("trade receivables over 180 days where the customer is blocked").rule.categories).toEqual(["trade-recv"]);
  });

  it("does not read the account group clearing as an action", () => {
    expect(parseRuleText("suspense and clearing older than 90 days").rule.action).toBe("Follow up");
    expect(parseRuleText("suspense older than 90 days and clear").rule.action).toBe("Clear");
  });

  it("warns instead of guessing when it understands little", () => {
    const p = parseRuleText("something odd");
    expect(p.rule.categories).toBe("all");
    expect(p.rule.conditions).toEqual([]);
    expect(p.warnings.length).toBeGreaterThanOrEqual(2);
  });

  it("gives the same rule for the same sentence", () => {
    const t = "Retention over 365 days above 25 lakh, recommend escalate";
    expect(parseRuleText(t)).toEqual(parseRuleText(t));
  });
});

describe("the rule as the engine runs it", () => {
  it("takes its thresholds from the parameters so a controller can tune them", () => {
    const r = rule("vendor advances over 365 days above 10 lakh");
    const d = definitionOf(r);
    expect(d.params.map((p) => [p.key, p.value])).toEqual([["ageDays", 365], ["minAmount", 10_00_000]]);
    const ctx = run().ctx;
    const base = evaluatorOf(r)(ctx, { ageDays: 365, minAmount: 10_00_000 });
    const looser = evaluatorOf(r)(ctx, { ageDays: 180, minAmount: 10_00_000 });
    expect(looser.length).toBeGreaterThanOrEqual(base.length);
    expect(base.length).toBeGreaterThan(0);
  });

  it("flags exactly the open items that meet every condition", () => {
    const r = rule("customer advances over 365 days above 5 lakh");
    const ctx = run().ctx;
    const hits = new Set(evaluatorOf(r)(ctx, { ageDays: 365, minAmount: 5_00_000 }).map((h) => h.itemKey));
    const expected = ctx.open.filter((l) => ctx.gl.get(l.gl)!.category === "customer-adv" && ageOf(l, ctx.asOf) > 365 && Math.abs(l.amount) >= 5_00_000);
    expect(hits.size).toBe(expected.length);
    for (const l of expected) expect(hits.has(l.key)).toBe(true);
  });

  it("backtests to the same items the rule flags once added", () => {
    const text = "retention over 180 days above 5 lakh, recommend follow up";
    const bt = backtest(rule(text), run());
    expect(bt.count).toBeGreaterThan(0);
    expect(bt.fresh.count + bt.overlap.length).toBeGreaterThan(0);
    expect(bt.rows.length).toBe(bt.count);
    expect(bt.byCategory.reduce((s, c) => s + c.count, 0)).toBe(bt.count);
    const added = wf().addStudioRule(parseRuleText(text).rule);
    expect(added.ok).toBe(true);
    if (added.ok) expect(added.count).toBe(bt.count);
  });
});

describe("accepting a rule", () => {
  it("adds it to the library, runs it, and logs who added it", () => {
    const parsed = parseRuleText("retention over 180 days above 5 lakh, recommend follow up").rule;
    const r = wf().addStudioRule(parsed);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.id).toBe("CUS-01");
    const m = modelsAt();
    const rr = m.review.run.rules.find((x) => x.id === "CUS-01")!;
    expect(rr.custom).toBe(true);
    expect(rr.enabled).toBe(true);
    expect(m.review.run.byRule.get("CUS-01")!.count).toBe(r.count);
    expect(m.review.rows.some((x) => x.hits.some((h) => h.ruleId === "CUS-01"))).toBe(true);
    const ev = wf().events.find((e) => e.action === "Rule added");
    expect(ev?.object.id).toBe("CUS-01");
    expect(ev?.details?.itemsAfter).toBe(r.count);
  });

  it("recommends the rule's own action for an item no more specific rule explains", () => {
    wf().addStudioRule(parseRuleText("unbilled revenue over 365 days, recommend provide").rule);
    const rows = modelsAt().review.rows.filter((x) => x.hits.some((h) => h.ruleId === "CUS-01") && x.rec?.primaryRuleId === "CUS-01");
    expect(rows.length).toBeGreaterThan(0);
    for (const x of rows) {
      expect(["Provide", "Follow up"]).toContain(x.rec!.action);
      expect(x.rec!.factors.reduce((s, f) => s + (f.met ? f.weight : 0), 0)).toBeCloseTo(x.rec!.confidence, 2);
    }
  });

  it("is refused for a role that may not edit rules, and for a rule with no condition", () => {
    as("external-auditor");
    expect(wf().addStudioRule(parseRuleText("retention over 180 days").rule).ok).toBe(false);
    as("controller");
    expect(wf().addStudioRule(parseRuleText("something odd").rule).ok).toBe(false);
  });

  it("numbers rules in turn and removes one cleanly", () => {
    expect(nextStudioId([])).toBe("CUS-01");
    expect(nextStudioId(["BSR-01", "CUS-01", "CUS-03"])).toBe("CUS-04");
    wf().addStudioRule(parseRuleText("retention over 180 days").rule);
    expect(wf().removeStudioRule("CUS-01").ok).toBe(true);
    const m = modelsAt();
    expect(m.review.run.rules.some((x) => x.id === "CUS-01")).toBe(false);
    expect(m.review.rows.some((x) => x.hits.some((h) => h.ruleId === "CUS-01"))).toBe(false);
  });

  it("is forgotten when the demo is reset", () => {
    wf().addStudioRule(parseRuleText("retention over 180 days").rule);
    wf().resetDemo();
    expect(modelsAt().review.run.rules.some((x) => x.id === "CUS-01")).toBe(false);
  });
});

describe("suggestions", () => {
  it("only suggests rules that would flag items nothing flags today, and each can be read back", () => {
    const s = suggestRules(run());
    for (const x of s) {
      const parsed = parseRuleText(x.text);
      expect(parsed.rule.conditions.length).toBeGreaterThan(0);
      expect(parsed.warnings.filter((w) => w.startsWith("No condition"))).toEqual([]);
      const bt = backtest({ id: "CUS-99", ...parsed.rule }, run());
      expect(bt.fresh.count).toBe(x.fresh.count);
      expect(x.fresh.count).toBeGreaterThanOrEqual(3);
    }
    const values = s.map((x) => x.fresh.value);
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});
