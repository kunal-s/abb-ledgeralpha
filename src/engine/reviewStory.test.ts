import { beforeEach, describe, expect, it } from "vitest";
import { GL_BY_ID, PERSON_BY_ID, WORLD } from "@/data";
import { APPROVAL_BANDS, ESCALATION_POLICY, bandFor, escalatedBandFor } from "@/config/policies";
import { actionMix, currentStage, draftPortfolioCommentary, focusAreas, itemStages, itemTimeline, portfolioFacts, staleBalances, FOCUS_CATEGORIES, STALE_DAYS } from "@/engine/reviewStory";
import { fmtINRCompact } from "@/lib/format";
import { modelsAt } from "@/test/models";
import { useRoleStore } from "@/lib/stores";
import { useWorkflow } from "@/state/workflow";

const rows = () => modelsAt().review.rows;
const liveRows = () => rows().filter((r) => r.flagged && r.isOpen);
const absAmt = (r: { item: { amount: number } }) => Math.abs(r.item.amount);

describe("review story", () => {
  it("splits each focus area across the ageing buckets without losing value or items", () => {
    const areas = focusAreas(rows());
    expect(areas.map((a) => a.category)).toEqual(FOCUS_CATEGORIES);
    for (const a of areas) {
      const buckets = Object.values(a.byBucket);
      expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(a.count);
      expect(buckets.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(a.value, 2);
      expect(a.count).toBe(liveRows().filter((r) => r.category === a.category).length);
    }
    expect(areas.some((a) => a.count > 0)).toBe(true);
  });

  it("accounts for every flagged open item exactly once in the action mix", () => {
    const mix = actionMix(rows());
    expect(mix.reduce((s, m) => s + m.count, 0)).toBe(liveRows().length);
    expect(mix.reduce((s, m) => s + m.value, 0)).toBeCloseTo(liveRows().reduce((s, r) => s + absAmt(r), 0), 2);
  });

  it("counts only items older than the stale limit, largest account first", () => {
    const stale = staleBalances(rows());
    const expected = liveRows().filter((r) => r.age > STALE_DAYS);
    expect(stale.reduce((s, a) => s + a.count, 0)).toBe(expected.length);
    expect(stale.reduce((s, a) => s + a.amount, 0)).toBeCloseTo(expected.reduce((s, r) => s + absAmt(r), 0), 2);
    for (const a of stale) expect(a.oldest).toBeGreaterThan(STALE_DAYS);
    expect(stale.map((a) => a.amount)).toEqual([...stale.map((a) => a.amount)].sort((x, y) => y - x));
  });

  it("writes a commentary whose figures are the facts", () => {
    const facts = portfolioFacts(rows(), { signed: 3, total: 10 });
    const text = draftPortfolioCommentary(facts);
    expect(text).toContain(fmtINRCompact(facts.flaggedValue));
    expect(text).toContain("3 of 10 accounts are signed off");
    expect(text.includes(String.fromCharCode(8212))).toBe(false);
  });
});

describe("Escalate", () => {
  beforeEach(() => useRoleStore.setState({ role: "controller" }));

  it("is decided one approval level above the band of its amount, and never below the first", () => {
    expect(escalatedBandFor(1_00_000).id).toBe("B2");
    expect(escalatedBandFor(20_00_000).id).toBe("B3");
    expect(escalatedBandFor(5_00_00_000).id).toBe("B3");
    expect(APPROVAL_BANDS.length).toBe(3);
  });

  it("is only recommended for large, old items with no specific finding", () => {
    const esc = [...modelsAt().review.rows].filter((r) => r.rec?.action === "Escalate");
    expect(esc.length).toBeGreaterThan(0);
    for (const r of esc) {
      expect(r.rec!.primaryRuleId).toBe("BSR-01");
      expect(absAmt(r)).toBeGreaterThanOrEqual(ESCALATION_POLICY.minAmount);
      expect(r.age).toBeGreaterThan(ESCALATION_POLICY.minAgeDays);
      expect(r.rec!.approvalBandId).toBe(escalatedBandFor(r.item.amount).id);
      expect(r.rec!.confidence).toBeGreaterThanOrEqual(0.6);
    }
  });

  it("is never recommended for an item a specific rule explains", () => {
    for (const r of rows()) if (r.rec && r.rec.primaryRuleId !== "BSR-01") expect(r.rec.action).not.toBe("Escalate");
  });

  it("proposes a decision that follows the escalated chain and makes no journal", () => {
    const r = modelsAt().review.rows.find((x) => x.isOpen && x.flagged && !x.decision && Math.abs(x.item.amount) <= 5_00_000)!;
    const owner = WORLD.people.find((p) => p.id === GL_BY_ID.get(r.item.gl)!.ownerId)!;
    useRoleStore.setState({ role: owner.roleId });
    const res = useWorkflow.getState().proposeDecision({ itemKey: r.key, module: "balance-sheet-review", action: "Escalate", amount: r.item.amount, justification: "Large and old, no explanation on file", hits: [], rulesVersion: "t" });
    expect(res.ok).toBe(true);
    const d = Object.values(useWorkflow.getState().decisions).find((x) => x.itemKey === r.key && x.action === "Escalate")!;
    expect(d.approvalBandId).toBe(escalatedBandFor(r.item.amount).id);
    expect(d.approvalBandId).not.toBe(bandFor(r.item.amount).id);
    expect(d.taxReviewRequired).toBe(false);
  });
});

describe("item process", () => {
  const s01 = () => WORLD.anchors["S-01"][0];
  const stagesOf = (key: string) => {
    const m = modelsAt().review;
    const row = m.rows.find((r) => r.key === key)!;
    const acct = m.accountByGl.get(row.item.gl);
    return itemStages({ row, accountStatus: acct?.status, signOff: acct?.signOff, extractedAt: WORLD.extractedAt });
  };
  const at = (key: string, id: string) => stagesOf(key).find((s) => s.id === id)!;
  beforeEach(() => {
    useWorkflow.getState().resetDemo();
    useRoleStore.setState({ role: "controller" });
  });

  it("opens a flagged item at the decision, held by the account owner, with the band's checkers next", () => {
    const st = stagesOf(s01());
    expect(st.map((s) => s.id)).toEqual(["source", "flagged", "evidence", "propose", "approve", "post", "account"]);
    expect(st[0].state).toBe("done");
    expect(st[1].state).toBe("done");
    expect(at(s01(), "evidence").state).toBe("optional");
    expect(currentStage(st).id).toBe("propose");
    expect(currentStage(st).who).toBe(PERSON_BY_ID.get(GL_BY_ID.get("211300")!.ownerId)!.name);
    expect(at(s01(), "approve").who).toBe("Financial Controller, then Head of Finance");
    expect(at(s01(), "approve").detail).toBe("Band B2, tax review");
  });

  it("moves from the maker to each checker in turn, then to posting", () => {
    const key = s01();
    const row = modelsAt().review.rows.find((r) => r.key === key)!;
    useRoleStore.setState({ role: "gl-accountant" });
    expect(useWorkflow.getState().proposeDecision({ itemKey: key, module: "balance-sheet-review", action: "Write back", amount: row.item.amount, justification: "PO closed, vendor inactive, no invoice will come", recommendation: row.rec, hits: row.hits, rulesVersion: "t" }).ok).toBe(true);
    expect(at(key, "evidence").state).toBe("skipped");
    expect(currentStage(stagesOf(key)).id).toBe("approve");
    expect(currentStage(stagesOf(key)).who).toContain("Meera Iyer");
    const id = Object.values(useWorkflow.getState().decisions).find((d) => d.itemKey === key)!.id;
    useRoleStore.setState({ role: "controller" });
    expect(useWorkflow.getState().approveDecision(id).ok).toBe(true);
    expect(currentStage(stagesOf(key)).who).toContain("Sanjay Raghavan");
    useRoleStore.setState({ role: "head-of-finance" });
    expect(useWorkflow.getState().approveDecision(id).ok).toBe(true);
    expect(currentStage(stagesOf(key)).who).toContain("Lakshmi Subramanian");
    useRoleStore.setState({ role: "tax-specialist" });
    expect(useWorkflow.getState().taxReview(id, "cleared").ok).toBe(true);
    expect(at(key, "approve").state).toBe("done");
    expect(at(key, "approve").who).toBe("Lakshmi Subramanian");
    expect(currentStage(stagesOf(key)).id).toBe("post");
    expect(at(key, "post").detail).toBe("Export to the proposal file");
  });

  it("asks for evidence first when the recommendation is to follow up", () => {
    const r = modelsAt().review.rows.find((x) => x.flagged && x.isOpen && x.rec?.action === "Follow up" && !x.followUp && !x.decision)!;
    const st = stagesOf(r.key);
    expect(currentStage(st).id).toBe("evidence");
    expect(st.find((s) => s.id === "propose")!.state).toBe("upcoming");
  });

  it("runs an item raised in another module through the same stages, from its own starting point", () => {
    const r = modelsAt().review.rows.find((x) => !x.flagged && x.item.gl === "210100" && x.item.amount < 0)!;
    useRoleStore.setState({ role: "gl-accountant" });
    expect(useWorkflow.getState().requestFollowUp({ itemKey: r.key, module: "indirect-tax", owner: "Supplier", dueDate: "2026-10-20", message: "Please report the invoice" }).ok).toBe(true);
    const st = stagesOf(r.key);
    expect(st.find((s) => s.id === "flagged")!.label).toBe("Raised");
    expect(st.find((s) => s.id === "flagged")!.who).toBe("GST");
    expect(currentStage(st).id).toBe("evidence");
  });

  it("leaves nothing to do for an item within policy", () => {
    const r = modelsAt().review.rows.find((x) => !x.flagged && x.isOpen)!;
    const st = stagesOf(r.key);
    expect(st.filter((s) => ["evidence", "propose", "approve", "post"].includes(s.id)).every((s) => s.state === "skipped")).toBe(true);
  });
});

describe("item timeline", () => {
  it("runs from the posting to the review date, in date order, with no future activity", () => {
    const m = modelsAt().review;
    const sample = m.rows.filter((r) => r.flagged && r.isOpen).slice(0, 200);
    expect(sample.length).toBeGreaterThan(0);
    for (const r of sample) {
      const t = itemTimeline(r, m.asOf);
            expect(t.some((e) => e.kind === "asat")).toBe(true);
      expect(t.some((e) => e.label.startsWith("Posted as"))).toBe(true);
      const dates = t.map((e) => e.date);
      expect(dates).toEqual([...dates].sort());
      for (const e of t) if (e.kind === "activity") expect(e.date <= m.asOf).toBe(true);
    }
  });
});
