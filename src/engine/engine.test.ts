import { beforeEach, describe, expect, it } from "vitest";
import { WORLD } from "@/data";
import { effectiveRules, runRules, type RuleOverrides } from "@/engine/run";
import { recommend } from "@/engine/recommend";
import { seededHistory } from "@/engine/history";
import { SEEDED_RULE_OVERRIDES } from "@/data/workspace/activity";
import { useWorkflow } from "@/state/workflow";
import { useRoleStore } from "@/lib/stores";
import type { RoleId } from "@/types";

const AS_OF = WORLD.asOf;
const anchor = (id: string, i = 0) => WORLD.anchors[id][i];
const run = (overrides: RuleOverrides = SEEDED_RULE_OVERRIDES) => runRules(AS_OF, effectiveRules(overrides));
const base = run();
const hitIds = (r: ReturnType<typeof run>, ruleId: string) => new Set(r.hits.filter((h) => h.ruleId === ruleId).map((h) => h.itemKey));
const withParams = (ruleId: string, params: Record<string, number>) => run({ ...SEEDED_RULE_OVERRIDES, [ruleId]: { params } });
const enable = (ruleId: string) => run({ ...SEEDED_RULE_OVERRIDES, [ruleId]: { enabled: true } });

describe("rule engine", () => {
  it("re-evaluates the whole population in under 500 ms", () => {
    const t0 = performance.now();
    run({ "BSR-01": { params: { ageDays: 200 } } });
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it("flags a plausible share of open items", () => {
    expect(base.items.size).toBeGreaterThan(500);
    expect(base.items.size).toBeLessThan(base.ctx.open.length);
  });

  it("starts from the workspace's configuration (BSR-10 tightened to 30 days)", () => {
    const r = base.rules.find((x) => x.id === "BSR-10")!;
    expect(r.params[0].value).toBe(30);
    expect(r.changed).toBe(true);
    expect(base.rules.filter((x) => x.changed).map((x) => x.id)).toEqual(["BSR-10"]);
  });

  const cases: [string, string, () => boolean][] = [
    ["BSR-01", "S-01", () => !hitIds(withParams("BSR-01", { ageDays: 500 }), "BSR-01").has(anchor("S-01"))],
    ["BSR-02", "S-01", () => {
      const young = base.ctx.open.find((l) => l.gl.startsWith("2113") && l.amount < 0 && l.postingDate > "2026-01-01")!;
      return !hitIds(base, "BSR-02").has(young.key);
    }],
    ["BSR-03", "S-02", () => !hitIds(base, "BSR-03").has(anchor("S-01"))],
    ["BSR-04", "S-03", () => !hitIds(withParams("BSR-04", { ageDays: 200 }), "BSR-04").has(anchor("S-03"))],
    ["BSR-05", "S-04", () => !hitIds(withParams("BSR-05", { poIdleDays: 500 }), "BSR-05").has(anchor("S-04"))],
    ["BSR-06", "S-10", () => !hitIds(withParams("BSR-06", { ageDays: 600 }), "BSR-06").has(anchor("S-10"))],
    ["BSR-07", "S-06", () => {
      const credited = base.ctx.open.find((l) => l.gl === "161100" && l.postingDate < "2026-01-01" &&
        WORLD.taxCredits.some((c) => c.customerId === l.partner?.id && c.taxCredited === l.amount))!;
      return !hitIds(base, "BSR-07").has(credited.key);
    }],
    ["BSR-08", "S-08", () => {
      const recent = base.ctx.open.find((l) => l.gl === "141100" && base.ctx.project.get(l.wbs!)?.stage === "Execution" && (base.ctx.lastBillingByWbs.get(l.wbs!) ?? "") > "2026-06-01");
      return !recent || !hitIds(base, "BSR-08").has(recent.key);
    }],
    ["BSR-09", "S-09", () => !hitIds(withParams("BSR-09", { graceDays: 300 }), "BSR-09").has(anchor("S-09"))],
    ["BSR-10", "S-11", () => !hitIds(withParams("BSR-10", { ageDays: 250 }), "BSR-10").has(anchor("S-11"))],
    ["BSR-11", "S-13", () => !hitIds(withParams("BSR-11", { minAmount: 5_00_000 }), "BSR-11").has(anchor("S-13"))],
    ["BSR-12", "S-12", () => !hitIds(withParams("BSR-12", { roundTo: 30_00_000 }), "BSR-12").has(anchor("S-12"))],
    ["BSR-13", "S-12", () => !hitIds(withParams("BSR-13", { lateHour: 24, earlyHour: 0 }), "BSR-13").has(anchor("S-12"))],
    ["BSR-14", "S-14", () => !hitIds(withParams("BSR-14", { dormantDays: 500 }), "BSR-14").has(anchor("S-14"))],
    ["BSR-15", "S-15", () => !hitIds(withParams("BSR-15", { minAccounts: 4 }), "BSR-15").has(anchor("S-15", 2))],
    ["BSR-16", "S-16", () => !hitIds(withParams("BSR-16", { ageDays: 250 }), "BSR-16").has(anchor("S-16"))],
  ];

  for (const [ruleId, scenario, negative] of cases) {
    it(`${ruleId}: flags ${scenario} and not the negative case`, () => {
      const key = ruleId === "BSR-15" ? anchor(scenario, 2) : anchor(scenario);
      expect(hitIds(base, ruleId).has(key), "positive").toBe(true);
      expect(negative(), "negative").toBe(true);
    });
  }

  it("BSR-05 distinguishes advances with and without a guarantee", () => {
    const s04 = base.hits.find((h) => h.ruleId === "BSR-05" && h.itemKey === anchor("S-04"))!;
    const s05 = base.hits.find((h) => h.ruleId === "BSR-05" && h.itemKey === anchor("S-05"))!;
    expect(s04.facts.bgNo).toBe("HDFC/BG/2025/00731");
    expect(s05.facts.bgNo).toBe("");
  });

  it("BSR-07 reports missing credits", () => {
    for (const s of ["S-06", "S-07"]) {
      expect(base.hits.find((h) => h.ruleId === "BSR-07" && h.itemKey === anchor(s))!.facts.creditStatus).toBe("missing");
    }
  });

  it("BSR-17 and BSR-18 are off by default; BSR-18 finds exactly the MSME invoices", () => {
    expect(hitIds(base, "BSR-17").size).toBe(0);
    expect(hitIds(base, "BSR-18").size).toBe(0);
    expect(hitIds(enable("BSR-18"), "BSR-18")).toEqual(new Set(WORLD.anchors["S-24"]));
    const gst = enable("BSR-17");
    expect(hitIds(gst, "BSR-17").size).toBeGreaterThan(0);
  });
});

describe("recommendations", () => {
  const open = new Set<string>();
  const rec = (s: string, i = 0) => recommend(base, anchor(s, i), open)!;
  const expectations: [string, string, boolean?][] = [
    ["S-01", "Write back", true],
    ["S-02", "Clear"],
    ["S-03", "Follow up"],
    ["S-04", "Follow up"],
    ["S-05", "Provide"],
    ["S-06", "Follow up"],
    ["S-07", "Write off", true],
    ["S-08", "Follow up"],
    ["S-09", "Follow up"],
    ["S-10", "Write back", true],
    ["S-11", "Reclassify"],
    ["S-12", "Follow up"],
    ["S-13", "Reclassify"],
    ["S-14", "Follow up"],
    ["S-16", "Follow up"],
  ];
  for (const [s, action, tax] of expectations) {
    it(`${s} → ${action}`, () => {
      const r = rec(s);
      expect(r.action).toBe(action);
      expect(r.requiresTaxReview).toBe(Boolean(tax));
      expect(r.confidence).toBeGreaterThanOrEqual(0.6);
      expect(r.confidence).toBe(Math.round(r.factors.filter((x) => x.met).reduce((a, x) => a + x.weight, 0) * 100) / 100);
    });
  }

  it("S-01 is a strong write-back in approval band B2", () => {
    const r = rec("S-01");
    expect(r.confidence).toBeGreaterThanOrEqual(0.85);
    expect(r.approvalBandId).toBe("B2");
  });

  it("S-04 points to the guarantee", () => {
    expect(rec("S-04").nextStep).toContain("HDFC/BG/2025/00731");
  });

  it("weak evidence falls back to Follow up", () => {
    const weak = [...base.byItem.keys()].map((k) => recommend(base, k, open)!).filter((r) => r.rationale.startsWith("Evidence is not yet strong enough"));
    for (const r of weak) expect(r.action).toBe("Follow up");
  });
});

describe("workflow", () => {
  const as = (role: RoleId) => useRoleStore.setState({ role });
  const wf = () => useWorkflow.getState();
  const s01 = anchor("S-01");
  const hits = () => base.byItem.get(s01)!;

  beforeEach(() => {
    wf().resetDemo();
  });

  it("routes a write-back through the band chain and tax review", () => {
    as("gl-accountant");
    const p = wf().proposeDecision({ itemKey: s01, module: "balance-sheet-review", action: "Write back", amount: -18_64_320, justification: "Vendor confirmed no claim", recommendation: recommend(base, s01, new Set()), hits: hits(), rulesVersion: base.version });
    expect(p.ok).toBe(true);
    const id = (p as { id: string }).id;
    expect(wf().decisions[id].chain).toEqual(["controller", "head-of-finance"]);

    expect(wf().approveDecision(id).ok).toBe(false); // GL accountant is not next in the chain
    as("head-of-finance");
    expect(wf().approveDecision(id)).toEqual({ ok: false, error: "Waiting for Financial Controller" });
    as("controller");
    expect(wf().approveDecision(id).ok).toBe(true);
    as("head-of-finance");
    expect(wf().approveDecision(id).ok).toBe(true);
    expect(wf().decisions[id].status).toBe("proposed"); // waiting for tax review
    as("tax-specialist");
    expect(wf().taxReview(id, "cleared").ok).toBe(true);
    expect(wf().decisions[id].status).toBe("approved");

    as("gl-accountant");
    const e = wf().exportDecisions([id]);
    expect(e.ok).toBe(true);
    expect(wf().decisions[id].status).toBe("exported");
    expect(wf().markPosted((e as { batchId: string }).batchId).ok).toBe(true);
    expect(wf().decisions[id].status).toBe("closed-in-erp");
  });

  it("requires a justification at or above materiality", () => {
    as("gl-accountant");
    const r = wf().proposeDecision({ itemKey: anchor("S-05"), module: "balance-sheet-review", action: "Provide", amount: 36_80_000, justification: " ", hits: [], rulesVersion: base.version });
    expect(r.ok).toBe(false);
  });

  it("blocks reviewing your own decision", () => {
    as("tax-specialist");
    const p = wf().proposeDecision({ itemKey: anchor("S-07"), module: "balance-sheet-review", action: "Write off", amount: 2_18_940, justification: "Time-barred credit", recommendation: recommend(base, anchor("S-07"), new Set()), hits: [], rulesVersion: base.version });
    expect(p.ok).toBe(true);
    const r = wf().taxReview((p as { id: string }).id, "cleared");
    expect(r).toEqual({ ok: false, error: "The proposer cannot review their own decision" });
  });

  it("rejection needs a reason and frees the item for a new proposal", () => {
    as("gl-accountant");
    const p = wf().proposeDecision({ itemKey: anchor("S-03"), module: "balance-sheet-review", action: "Follow up", amount: 4_06_950, justification: "Chase GR", hits: [], rulesVersion: base.version }) as { ok: true; id: string };
    expect(wf().proposeDecision({ itemKey: anchor("S-03"), module: "balance-sheet-review", action: "Clear", amount: 4_06_950, justification: "x", hits: [], rulesVersion: base.version }).ok).toBe(false);
    as("controller");
    expect(wf().rejectDecision(p.id, "").ok).toBe(false);
    expect(wf().rejectDecision(p.id, "Goods were received; post the GR").ok).toBe(true);
    as("gl-accountant");
    expect(wf().proposeDecision({ itemKey: anchor("S-03"), module: "balance-sheet-review", action: "Follow up", amount: 4_06_950, justification: "Chase stores", hits: [], rulesVersion: base.version }).ok).toBe(true);
  });

  it("sign-off needs the preparer first and a different reviewer", () => {
    as("controller");
    expect(wf().signOff("211300", AS_OF, "reviewer").ok).toBe(false);
    as("gl-accountant");
    expect(wf().signOff("211300", AS_OF, "preparer").ok).toBe(true);
    as("controller");
    expect(wf().signOff("211300", AS_OF, "reviewer").ok).toBe(true);
    expect(wf().signOffs[`211300|${AS_OF}`].reviewer?.personId).toBe("P01");
  });

  it("only rule editors can change rules, and every change is logged with its effect", () => {
    as("gl-accountant");
    expect(wf().setRuleOverride("BSR-05", { params: { ageDays: 270 } }).ok).toBe(false);
    as("controller");
    const r = wf().setRuleOverride("BSR-05", { params: { ageDays: 270 } }, "Demo") as { ok: true; delta: { before: { count: number }; after: { count: number } } };
    expect(r.ok).toBe(true);
    expect(r.delta.after.count).toBeGreaterThanOrEqual(r.delta.before.count);
    const actions = wf().events.map((e) => e.action);
    expect(actions).toContain("Rule changed");
    expect(actions).toContain("Rule re-evaluated");
    wf().resetDemo();
    expect(wf().ruleOverrides).toEqual(SEEDED_RULE_OVERRIDES);
  });

  it("records follow-ups and responses", () => {
    as("ar-specialist");
    const f = wf().requestFollowUp({ itemKey: anchor("S-06"), module: "balance-sheet-review", owner: "Customer", dueDate: "2026-10-20", message: "Please revise your TDS return" }) as { ok: true; id: string };
    expect(f.ok).toBe(true);
    expect(wf().respondFollowUp(f.id, "Revised return filed").ok).toBe(true);
    expect(wf().followUps[f.id].status).toBe("responded");
  });
});

describe("workspace history", () => {
  it("records a load and an evaluated rule run for each month of the review cycle", () => {
    const h = seededHistory();
    const runs = h.filter((e) => e.action === "Rule library evaluated");
    expect(runs.length).toBeGreaterThanOrEqual(3);
    const latest = runs[runs.length - 1];
    expect(latest.details?.itemsFlagged).toBe(base.items.size);
    expect(h.some((e) => e.action === "Rule changed" && e.object.id === "BSR-10")).toBe(true);
  });
});
